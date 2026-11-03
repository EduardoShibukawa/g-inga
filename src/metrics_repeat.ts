import type { Database } from "bun:sqlite";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

export type RepeatedErrorMetrics = {
  plan: string;
  week: string;
  repeated: number;
  reused_lessons: number;
};

type EventRow = {
  ts: string | null;
  kind: string | null;
  plan: string | null;
  task: string | null;
  json: string;
};

type TaskScope = { plan: string; files: string[] };
type Learning = { date: string; files: string[]; text: string };
type Lesson = {
  id: string;
  files: string[];
  reasonText: string;
  date?: string;
};

type AttemptGroup = {
  plan: string;
  week: string;
  repeated: number;
  reusedLessons: Set<string>;
};

const DAY_MS = 86_400_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

function stringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) => stringArray(item));
  }
  const one = stringValue(value);
  return one === undefined ? [] : [one];
}

function frontmatter(text: string): Record<string, unknown> | null {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) return null;
  try {
    const parsed: unknown = Bun.YAML.parse(match[1] ?? "");
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function normalizePath(value: string): string {
  let path = value.trim().replace(/^["'`]|["'`]$/g, "").replaceAll("\\", "/");
  while (path.startsWith("./")) path = path.slice(2);
  return path.replace(/\/+$/, "");
}

function globMatches(pattern: string, value: string): boolean {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".");
  return new RegExp(`^${escaped}$`).test(value);
}

/** O escopo cobre o touch quando é o mesmo caminho, um diretório ancestral ou um glob. */
function scopeCovers(scope: string, touch: string): boolean {
  const pattern = normalizePath(scope);
  const target = normalizePath(touch);
  if (pattern === "" || target === "") return false;
  if (pattern === target) return true;
  if (target.startsWith(`${pattern}/`)) return true;
  if (pattern.includes("*") || pattern.includes("?")) return globMatches(pattern, target);
  return false;
}

function isoWeek(timestamp: string): string | null {
  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) return null;

  const thursday = new Date(
    Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()),
  );
  const weekday = thursday.getUTCDay() || 7;
  thursday.setUTCDate(thursday.getUTCDate() - weekday + 4);
  const year = thursday.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(year, 0, 1));
  const firstWeekday = firstThursday.getUTCDay() || 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstWeekday + 4);
  const week = Math.floor((thursday.getTime() - firstThursday.getTime()) / (7 * DAY_MS)) + 1;
  return `${year}-W${String(week).padStart(2, "0")}`;
}

function attemptDate(timestamp: string): string {
  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) return timestamp.slice(0, 10);
  return parsed.toISOString().slice(0, 10);
}

function taskScopes(root: string): Map<string, TaskScope> {
  const scopes = new Map<string, TaskScope>();
  const plansDir = join(root, "plans");
  if (!existsSync(plansDir)) return scopes;

  for (const planEntry of readdirSync(plansDir).sort()) {
    if (!planEntry.startsWith("PLAN-")) continue;
    const planDir = join(plansDir, planEntry);
    let entries: string[];
    try {
      entries = readdirSync(planDir);
    } catch {
      continue;
    }
    const plan = /^PLAN-\d+/.exec(planEntry)?.[0] ?? planEntry;

    for (const file of entries.filter((name) => /^TASK-.*\.md$/.test(name))) {
      const parsed = frontmatter(readFileSync(join(planDir, file), "utf8"));
      const task = stringValue(parsed?.pinga_task);
      if (!parsed || !task) continue;
      const files = stringArray(parsed.touch).map(normalizePath).filter(Boolean);
      scopes.set(task.toUpperCase(), { plan, files });
    }
  }
  return scopes;
}

function parseLearningSections(text: string): Learning[] {
  const lines = text.split(/\r?\n/);
  const learnings: Learning[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const heading = lines[index]?.match(/^##\s+(L-\d+)\b(.*)$/);
    if (!heading) continue;

    const date = (heading[2] ?? "")
      .split("·")
      .map((part) => part.trim())
      .find((part) => /^\d{4}-\d{2}-\d{2}$/.test(part));
    if (!date) continue;

    const section: string[] = [];
    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      if (/^##\s+/.test(lines[cursor] ?? "")) break;
      section.push(lines[cursor] ?? "");
    }

    const scopeLine = section.find((line) => /^- escopo:\s*/.test(line));
    const scope = scopeLine?.replace(/^- escopo:\s*/, "").trim() ?? "";
    const files = scope.split(/[,\s]+/).map(normalizePath).filter(Boolean);
    learnings.push({ date, files, text: section.join("\n").toLowerCase() });
  }
  return learnings;
}

function learnings(root: string): Learning[] {
  const plansDir = join(root, "plans");
  if (!existsSync(plansDir)) return [];
  const result: Learning[] = [];
  for (const planEntry of readdirSync(plansDir)) {
    if (!planEntry.startsWith("PLAN-")) continue;
    const path = join(plansDir, planEntry, "LEARNINGS.md");
    if (!existsSync(path)) continue;
    result.push(...parseLearningSections(readFileSync(path, "utf8")));
  }
  return result;
}

function lessons(root: string): Lesson[] {
  const lessonsDir = join(root, "knowledge", "lessons");
  if (!existsSync(lessonsDir)) return [];
  const result: Lesson[] = [];

  for (const file of readdirSync(lessonsDir).filter((name) => /^LESSON-\d+.*\.md$/.test(name))) {
    const text = readFileSync(join(lessonsDir, file), "utf8");
    const parsed = frontmatter(text);
    if (!parsed) continue;
    const scope = isRecord(parsed.scope) ? parsed.scope : {};
    const files = stringArray(scope.files).map(normalizePath).filter(Boolean);
    const tags = [...stringArray(scope.tags), ...stringArray(parsed.tags)];
    const title = stringValue(parsed.title) ?? "";
    const evidence = stringValue(parsed.evidence) ?? "";
    const rawDate = stringValue(parsed.date) ?? stringValue(parsed.created_at);
    const date = rawDate?.match(/^\d{4}-\d{2}-\d{2}/)?.[0];
    result.push({
      id: /^LESSON-\d+/.exec(file)?.[0] ?? file,
      files,
      reasonText: [title, evidence, ...tags].join("\n").toLowerCase(),
      ...(date ? { date } : {}),
    });
  }
  return result;
}

function parseEvent(row: EventRow): {
  timestamp: string;
  plan: string | null;
  task: string | null;
  data: Record<string, unknown>;
} {
  let envelope: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(row.json);
    if (isRecord(parsed)) envelope = parsed;
  } catch {
    // Uma linha corrompida não impede as demais métricas.
  }
  const data = isRecord(envelope.data) ? envelope.data : envelope;
  return {
    timestamp: row.ts ?? stringValue(envelope.ts) ?? stringValue(data.ts) ?? "",
    plan: row.plan ?? stringValue(envelope.plan) ?? null,
    task: row.task ?? stringValue(envelope.task) ?? null,
    data,
  };
}

/**
 * Conta falhas repetidas por PLAN/semana e lessons reutilizadas.
 * A correspondência é determinística: mesmo motivo, escopo compatível e
 * conhecimento anterior; nenhuma inferência por LLM.
 */
export function repeatedErrors(
  db: Database,
  root: string,
  options: { since?: string } = {},
): RepeatedErrorMetrics[] {
  const hasEvents = db
    .query("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'events'")
    .get() !== null;
  if (!hasEvents) return [];

  const rows = db
    .query(
      `SELECT ts, kind, plan, task, json FROM events
       WHERE kind = 'attempt' ORDER BY ts ASC, rowid ASC`,
    )
    .all() as EventRow[];
  const scopes = taskScopes(root);
  const knownLearnings = learnings(root);
  const knownLessons = lessons(root);
  const groups = new Map<string, AttemptGroup>();

  for (const row of rows) {
    const event = parseEvent(row);
    const since = options.since?.trim();
    if (since && event.timestamp < since) continue;
    if (event.data.passed !== false) continue;

    const reason = stringValue(event.data.failure) ?? stringValue(event.data.reason_code);
    const week = isoWeek(event.timestamp);
    if (!reason || !week) continue;

    const task = event.task ? scopes.get(event.task.toUpperCase()) : undefined;
    const plan = event.plan ?? task?.plan;
    if (!plan) continue;
    const key = `${plan}\u0000${week}`;
    const group = groups.get(key) ?? {
      plan,
      week,
      repeated: 0,
      reusedLessons: new Set<string>(),
    };
    groups.set(key, group);

    const touches = task?.files ?? [];
    if (touches.length === 0) continue;
    const day = attemptDate(event.timestamp);
    const learningMatches = knownLearnings.some(
      (learning) =>
        learning.date < day &&
        learning.files.some((scope) => touches.some((touch) => scopeCovers(scope, touch))) &&
        learning.text.includes(reason.toLowerCase()),
    );
    const lessonMatches = knownLessons.filter(
      (lesson) =>
        (lesson.date === undefined || lesson.date < day) &&
        lesson.files.some((scope) => touches.some((touch) => scopeCovers(scope, touch))) &&
        lesson.reasonText.includes(reason.toLowerCase()),
    );

    if (learningMatches || lessonMatches.length > 0) group.repeated += 1;
    for (const lesson of lessonMatches) group.reusedLessons.add(lesson.id);
  }

  return [...groups.values()]
    .sort((left, right) => left.plan.localeCompare(right.plan) || left.week.localeCompare(right.week))
    .map((group) => ({
      plan: group.plan,
      week: group.week,
      repeated: group.repeated,
      reused_lessons: group.reusedLessons.size,
    }));
}
