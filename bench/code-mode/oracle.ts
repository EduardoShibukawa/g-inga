import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { CMTask } from "./tasks";

type Frontmatter = Record<string, string[]>;

type TaskDoc = {
  id: string;
  file: string;
  touch: string[];
};

type PlanInfo = {
  name: string;
  snapshot: string;
  status: string;
  dependsOn: string[];
  tasks: TaskDoc[];
};

type Attempt = {
  task: string;
  model: string;
  attempt: number;
  outcome: "pass" | "fail";
};

type PaidAttempt = {
  task: string;
  model: string;
  cost: number;
};

function unquote(value: string): string {
  const trimmed = value.trim();
  if (
    trimmed.length >= 2 &&
    ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'")))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function splitInlineList(value: string): string[] {
  const parts: string[] = [];
  let current = "";
  let quote = "";

  for (const char of value) {
    if (quote) {
      current += char;
      if (char === quote) quote = "";
    } else if (char === '"' || char === "'") {
      quote = char;
      current += char;
    } else if (char === ",") {
      parts.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  parts.push(current);
  return parts.map(unquote).filter((part) => part.length > 0);
}

/** Parser Deliberadamente pequeno para o subconjunto YAML usado no snapshot. */
function parseFrontmatter(text: string): Frontmatter {
  const lines = text.split(/\r?\n/);
  if (lines[0]?.trim() !== "---") return {};

  const end = lines.findIndex((line, index) => index > 0 && line.trim() === "---");
  if (end < 0) return {};

  const result: Frontmatter = {};
  let currentKey = "";

  for (const line of lines.slice(1, end)) {
    const pair = /^([A-Za-z0-9_-]+):(?:[ \t]+(.*))?$/.exec(line);
    if (pair) {
      currentKey = pair[1];
      const raw = (pair[2] ?? "").trim();
      if (!raw) {
        result[currentKey] = [];
      } else if (raw.startsWith("[") && raw.endsWith("]")) {
        result[currentKey] = splitInlineList(raw.slice(1, -1));
      } else {
        result[currentKey] = [unquote(raw)];
      }
      continue;
    }

    const item = /^\s*-\s+(.+)$/.exec(line);
    if (item && currentKey) {
      result[currentKey] ??= [];
      result[currentKey].push(unquote(item[1]));
    }
  }

  return result;
}

function planBaseId(name: string): string {
  return name.match(/^(PLAN-\d+)/)?.[1] ?? name;
}

function readPlans(snapshot: string): PlanInfo[] {
  const plansDir = join(snapshot, "plans");
  const plans: PlanInfo[] = [];

  for (const entry of readdirSync(plansDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const planPath = join(plansDir, entry.name, "PLAN.md");
    if (!existsSync(planPath)) continue;

    const meta = parseFrontmatter(readFileSync(planPath, "utf8"));
    const tasks: TaskDoc[] = [];
    const taskDir = join(plansDir, entry.name);

    for (const file of readdirSync(taskDir).sort()) {
      if (!/^TASK-.*\.md$/.test(file)) continue;
      const id = file.match(/^(TASK-\d+)/)?.[1] ?? file.replace(/\.md$/, "");
      const taskMeta = parseFrontmatter(readFileSync(join(taskDir, file), "utf8"));
      tasks.push({ id, file, touch: taskMeta.touch ?? [] });
    }

    plans.push({
      name: entry.name,
      snapshot,
      status: meta.status?.[0] ?? "",
      dependsOn: meta.depends_on ?? [],
      tasks,
    });
  }

  return plans.sort((a, b) => a.name.localeCompare(b.name));
}

function readPlanLog(plan: PlanInfo): string {
  const path = join(plan.snapshot, "plans", plan.name, "log.md");
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}

function parseAttempts(log: string): Attempt[] {
  const attempts: Attempt[] = [];
  const pattern = /\b(TASK-\d+)\s+(\S+)\s+tentativa\s+(\d+)\s+(pass|fail)\b/g;

  for (const match of log.matchAll(pattern)) {
    attempts.push({
      task: match[1],
      model: match[2],
      attempt: Number(match[3]),
      outcome: match[4] as "pass" | "fail",
    });
  }
  return attempts;
}

function parsePaidAttempts(log: string): PaidAttempt[] {
  const attempts: PaidAttempt[] = [];
  const pattern =
    /\b(TASK-\d+)\s+(\S+)\s+tentativa\s+paga\s+(\d+)\s*:\s*US\$\s*(\d+(?:\.\d+)?)/g;

  for (const match of log.matchAll(pattern)) {
    attempts.push({
      task: match[1],
      model: match[2],
      cost: Number(match[4]),
    });
  }
  return attempts;
}

function taskPlans(plans: PlanInfo[]): PlanInfo[] {
  return plans.filter((plan) => plan.tasks.length > 0);
}

function round2(value: number): number {
  if (!Number.isFinite(value)) return value;
  const adjusted = value + Math.sign(value) * Number.EPSILON;
  return Math.round(adjusted * 100) / 100;
}

function planStatus(snapshot: string, name: string): string {
  const plan = readPlans(snapshot).find((candidate) => candidate.name === name);
  return plan?.status ?? "";
}

function planTaskCount(snapshot: string, name: string): number {
  const plan = readPlans(snapshot).find((candidate) => candidate.name === name);
  return plan?.tasks.length ?? 0;
}

function passingTaskTouch(plans: PlanInfo[]): unknown {
  for (const plan of taskPlans(plans)) {
    const log = readPlanLog(plan);
    for (const attempt of parseAttempts(log)) {
      if (attempt.model !== "pi:m1" || attempt.attempt !== 1 || attempt.outcome !== "pass") {
        continue;
      }
      const task = plan.tasks.find((candidate) => candidate.id === attempt.task);
      if (task) return { plan: plan.name, task: task.id, touch: task.touch };
    }
  }
  throw new Error("nenhuma TASK passou na tentativa 1 com pi:m1");
}

function costsByModel(plans: PlanInfo[]): Record<string, number> {
  const totals = new Map<string, number>();

  for (const plan of taskPlans(plans)) {
    for (const attempt of parsePaidAttempts(readPlanLog(plan))) {
      totals.set(attempt.model, (totals.get(attempt.model) ?? 0) + attempt.cost);
    }
  }

  return Object.fromEntries(
    [...totals.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([model, cost]) => [model, round2(cost)]),
  );
}

function attemptsByModel(plans: PlanInfo[]): unknown {
  const stats = new Map<string, { attempts: number; pass: number }>();

  for (const plan of taskPlans(plans)) {
    for (const attempt of parseAttempts(readPlanLog(plan))) {
      const current = stats.get(attempt.model) ?? { attempts: 0, pass: 0 };
      current.attempts += 1;
      if (attempt.outcome === "pass") current.pass += 1;
      stats.set(attempt.model, current);
    }
  }

  return Object.fromEntries(
    [...stats.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([model, value]) => [
        model,
        {
          attempts: value.attempts,
          pass: value.pass,
          rate: round2(value.pass / value.attempts),
        },
      ]),
  );
}

function freeUsageLogs(snapshot: string): number {
  const runsDir = join(snapshot, "runs");
  let count = 0;

  for (const file of readdirSync(runsDir)) {
    if (!file.endsWith(".log")) continue;
    if (readFileSync(join(runsDir, file), "utf8").includes("Free usage limit")) count += 1;
  }
  return count;
}

function stepFinishEvents(snapshot: string): number {
  const runsDir = join(snapshot, "runs");
  let count = 0;

  for (const file of readdirSync(runsDir)) {
    if (!file.endsWith(".jsonl")) continue;
    const text = readFileSync(join(runsDir, file), "utf8");
    for (const line of text.split(/\r?\n/)) {
      if (!line.trim()) continue;
      try {
        const event = JSON.parse(line) as { type?: unknown };
        if (event.type === "step_finish") count += 1;
      } catch {
        // Uma linha inválida não é um evento step_finish.
      }
    }
  }
  return count;
}

function resolveDependency(dependency: string, plans: PlanInfo[]): PlanInfo | undefined {
  const exact = plans.find((plan) => plan.name === dependency);
  if (exact) return exact;

  const base = planBaseId(dependency);
  return plans.find((plan) => planBaseId(plan.name) === base);
}

function plansDependingOnDraft(plans: PlanInfo[]): string[] {
  function dependsOnDraft(plan: PlanInfo, visiting: Set<string>): boolean {
    for (const dependency of plan.dependsOn) {
      const target = resolveDependency(dependency, plans);
      if (!target) continue;
      if (target.status.toLowerCase() === "draft") return true;
      if (!visiting.has(target.name) && dependsOnDraft(target, new Set([...visiting, target.name]))) {
        return true;
      }
    }
    return false;
  }

  return plans
    .filter(
      (plan) => plan.status.toLowerCase() !== "draft" && dependsOnDraft(plan, new Set([plan.name])),
    )
    .map((plan) => plan.name)
    .sort((a, b) => a.localeCompare(b));
}

function zeroCostPaidAttempts(plans: PlanInfo[]): unknown[] {
  const zeroCost: unknown[] = [];

  for (const plan of taskPlans(plans)) {
    for (const attempt of parsePaidAttempts(readPlanLog(plan))) {
      if (attempt.cost === 0) {
        zeroCost.push({ plan: plan.name, task: attempt.task, cost: 0 });
      }
    }
  }
  return zeroCost;
}

function missingTaskFiles(plans: PlanInfo[]): string[] {
  const missing: string[] = [];

  for (const plan of taskPlans(plans)) {
    const known = new Set(plan.tasks.map((task) => task.id));
    const cited = new Set<string>();
    for (const match of readPlanLog(plan).matchAll(/\bTASK-\d+\b/g)) cited.add(match[0]);
    for (const task of cited) {
      if (!known.has(task)) missing.push(`${plan.name}/${task}`);
    }
  }

  return missing.sort((a, b) => a.localeCompare(b));
}

/** Calcula a resposta de referência de uma task somente com o snapshot local. */
export function oracle(task: CMTask, snapshot: string): unknown {
  const plans = readPlans(snapshot);

  switch (task.id) {
    case "t01":
      return planStatus(snapshot, "PLAN-0001-alpha");
    case "t02":
      return planTaskCount(snapshot, "PLAN-0001-alpha");
    case "t03":
      return passingTaskTouch(plans);
    case "t04":
      return costsByModel(plans);
    case "t05":
      return attemptsByModel(plans);
    case "t06":
      return freeUsageLogs(snapshot);
    case "t07":
      return stepFinishEvents(snapshot);
    case "t08":
      return plansDependingOnDraft(plans);
    case "t09":
      return zeroCostPaidAttempts(plans);
    case "t10":
      return missingTaskFiles(plans);
    default:
      throw new Error(`task desconhecida: ${task.id}`);
  }
}

function stableStringify(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (typeof value === "object") {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(object[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function normalize(value: unknown): unknown {
  if (typeof value === "number") return Number.isFinite(value) ? round2(value) : String(value);
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(trimmed)) {
      const numeric = Number(trimmed);
      if (Number.isFinite(numeric)) return round2(numeric);
    }
    return trimmed;
  }
  if (Array.isArray(value)) {
    return value
      .map(normalize)
      .sort((a, b) => {
        const left = stableStringify(a);
        const right = stableStringify(b);
        return left < right ? -1 : left > right ? 1 : 0;
      });
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, normalize(item)]),
    );
  }
  return value === undefined ? null : value;
}

/** Verificador exato: ignora ordem de listas e compara números com duas casas. */
export function verify(task: CMTask, answer: unknown, snapshot: string): 0 | 1 {
  try {
    const expected = normalize(oracle(task, snapshot));
    const received = normalize(answer);
    return stableStringify(expected) === stableStringify(received) ? 1 : 0;
  } catch {
    return 0;
  }
}
