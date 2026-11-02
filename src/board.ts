// board.ts - modelo único do quadro e do Inbox (PLAN-0012 TASK-01)

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Database } from "bun:sqlite";
import { listAlerts } from "./alerts";
import { fmGet } from "./verbs/write";
import { listLearnings } from "./lessons";

export type Card = {
  id: string;
  kind: "intent" | "spec" | "plan";
  title: string;
  status: string;
  repo?: string;
  track?: "pequena" | "feature";
  tasks: { total: number; pass: number; running: number };
  blocked: boolean;
};

export type Column = "INTENT" | "SPEC" | "PLAN" | "EXECUTANDO" | "VERIFICANDO" | "FEITO";

export type InboxItem = {
  id: string;
  type: "blocker" | "aprovar" | "budget" | "decidir" | "promover" | "promover?" | "alerta";
  entity?: string;
  title?: string;
  severity?: "info" | "warn" | "high" | "critical";
  actions?: string[];
  question?: string;
  raised_by?: string;
  plan?: string | null;
  task?: string | null;
  status?: string;
  pending?: string[];
};

export type Board = {
  columns: Record<Column, Card[]>;
  inbox: InboxItem[];
};

type BundleItem = {
  id: string;
  kind: "intent" | "spec" | "plan";
  status: string;
  title: string;
  raw: string;
  dir?: string;
};

const KIND_DIRS = [
  { kind: "intent" as const, subdir: "intents", inDir: false },
  { kind: "spec" as const, subdir: "specs", inDir: false },
  { kind: "plan" as const, subdir: "plans", inDir: true },
];

function listBundle(root: string): BundleItem[] {
  const out: BundleItem[] = [];
  for (const { kind, subdir, inDir } of KIND_DIRS) {
    const base = join(root, subdir);
    if (!existsSync(base)) continue;
    for (const entry of readdirSync(base).sort()) {
      const m = new RegExp(`^${kind.toUpperCase()}-\\d{4}`).exec(entry);
      if (!m) continue;
      const file = inDir ? join(base, entry, "PLAN.md") : join(base, entry);
      if (!existsSync(file)) continue;
      const raw = readFileSync(file, "utf8");
      out.push({
        id: m[0],
        kind,
        status: fmGet(raw, "status") ?? "draft",
        title: fmGet(raw, "title") ?? entry,
        raw,
        dir: inDir ? join(base, entry) : undefined,
      });
    }
  }
  return out;
}

function listPlanTasks(planDir: string): Array<{ id: string; status: string; raw: string }> {
  const out: Array<{ id: string; status: string; raw: string }> = [];
  if (!existsSync(planDir)) return out;
  for (const entry of readdirSync(planDir).sort()) {
    const m = /^TASK-\d{2}/.exec(entry);
    if (!m) continue;
    if (entry === "PLAN.md") continue;
    if (!entry.endsWith(".md")) continue;
    const file = join(planDir, entry);
    if (!existsSync(file)) continue;
    const raw = readFileSync(file, "utf8");
    out.push({
      id: m[0],
      status: fmGet(raw, "status") ?? "draft",
      raw,
    });
  }
  return out;
}

function countPassReceipts(db: Database, planId: string, taskId: string): number {
  try {
    const rows = db
      .query("SELECT json FROM events WHERE kind = 'receipt' AND plan = ? AND task = ?")
      .all(planId, taskId) as Array<Record<string, any>>;
    let count = 0;
    for (const row of rows) {
      try {
        const parsed = JSON.parse(row.json);
        const status = parsed?.data?.status ?? parsed?.status;
        const check = parsed?.data?.check ?? parsed?.check;
        if (status === "pass" && (check === "verify" || check === "bdd" || check == null)) {
          count++;
        } else if (status === "pass") {
          count++;
        }
      } catch {
        // ignore
      }
    }
    return count;
  } catch {
    return 0;
  }
}

function getIntentTrack(root: string, intentId: string): "pequena" | "feature" | undefined {
  const intentsDir = join(root, "intents");
  if (!existsSync(intentsDir)) return undefined;
  for (const entry of readdirSync(intentsDir)) {
    if (entry.startsWith(intentId)) {
      const file = join(intentsDir, entry);
      if (existsSync(file)) {
        const raw = readFileSync(file, "utf8");
        const track = fmGet(raw, "track");
        if (track === "feature") return "feature";
        if (track === "pequena") return "pequena";
      }
    }
  }
  return undefined;
}


function tableExists(db: Database, name: string): boolean {
  try {
    return db.query("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(name) !== null;
  } catch {
    return false;
  }
}

function parseJson(value: unknown): Record<string, unknown> {
  try {
    const parsed = JSON.parse(String(value));
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function eventData(row: Record<string, any>): Record<string, any> {
  const env = parseJson(row.json);
  const data = env.data;
  return data && typeof data === "object" ? (data as Record<string, any>) : env;
}

type OpenBlocker = {
  id: string;
  plan: string | null;
  task: string | null;
  data: Record<string, any>;
};

function listOpenBlockers(db: Database): OpenBlocker[] {
  const answered = new Set<string>();
  if (tableExists(db, "answers")) {
    try {
      for (const row of db.query('SELECT "blocker_id" FROM answers').all() as Array<Record<string, any>>) {
        answered.add(String(row.blocker_id));
      }
    } catch {
      // ignore
    }
  }
  try {
    for (const row of db.query("SELECT id, ts, plan, task, json FROM events WHERE kind = 'answer' ORDER BY ts").all() as Array<Record<string, any>>) {
      const data = eventData(row);
      if (typeof data.blocker_id === "string") answered.add(data.blocker_id);
    }
  } catch {
    // ignore
  }

  const open: OpenBlocker[] = [];
  try {
    for (const row of db.query("SELECT id, ts, plan, task, json FROM events WHERE kind = 'blocker' ORDER BY ts").all() as Array<Record<string, any>>) {
      const data = eventData(row);
      const blockerId = typeof data.blocker_id === "string" ? data.blocker_id : null;
      if (!blockerId || answered.has(blockerId)) continue;
      open.push({
        id: blockerId,
        plan: typeof row.plan === "string" ? row.plan : null,
        task: typeof row.task === "string" ? row.task : null,
        data,
      });
    }
  } catch {
    // ignore
  }
  return open;
}

export function deriveBoard(root: string, db: Database): Board {
  const items = listBundle(root);
  const columns: Record<Column, Card[]> = {
    INTENT: [],
    SPEC: [],
    PLAN: [],
    EXECUTANDO: [],
    VERIFICANDO: [],
    FEITO: [],
  };
  const inbox: InboxItem[] = [];

  // Build maps
  const intents = items.filter((i) => i.kind === "intent");
  const specs = items.filter((i) => i.kind === "spec");
  const plans = items.filter((i) => i.kind === "plan");
  const openBlockers = listOpenBlockers(db);
  const blockedPlans = new Set(openBlockers.flatMap((b) => (b.plan ? [b.plan] : [])));

  // Add intents to INTENT column
  for (const intent of intents) {
    const track = getIntentTrack(root, intent.id) ?? fmGet(intent.raw, "track") as any;
    columns.INTENT.push({
      id: intent.id,
      kind: "intent",
      title: intent.title,
      status: intent.status,
      track: track === "feature" ? "feature" : track === "pequena" ? "pequena" : undefined,
      tasks: { total: 0, pass: 0, running: 0 },
      blocked: false,
    });
  }

  // Add specs
  for (const spec of specs) {
    // SPEC draft waiting for approval -> inbox
    if (spec.status === "draft") {
      inbox.push({
        id: spec.id,
        type: "aprovar",
        entity: spec.id,
        title: spec.title,
        actions: ["approve", "reject"],
      });
    }
    columns.SPEC.push({
      id: spec.id,
      kind: "spec",
      title: spec.title,
      status: spec.status,
      tasks: { total: 0, pass: 0, running: 0 },
      blocked: false,
    });
  }

  // Add plans
  for (const plan of plans) {
    if (plan.status === "draft") {
      inbox.push({
        id: plan.id,
        type: "aprovar",
        entity: plan.id,
        title: plan.title,
        actions: ["approve", "reject"],
      });
    }
    const repos = fmGet(plan.raw, "repos");
    let repo: string | undefined;
    if (repos) {
      // try to parse array
      const m = repos.match(/\[([^\]]+)\]/);
      if (m) {
        repo = m[1].split(",")[0].trim().replace(/['"]/g, "");
      } else {
        repo = repos.trim();
      }
    }
    const intentId = fmGet(plan.raw, "intent");
    const track = intentId ? getIntentTrack(root, intentId) : undefined;

    let total = 0;
    let pass = 0;
    let running = 0;
    if (plan.dir) {
      const tasks = listPlanTasks(plan.dir);
      total = tasks.length;
      for (const task of tasks) {
        const p = countPassReceipts(db, plan.id, task.id);
        if (p > 0) pass += 1;
        else if (task.status === "running" || task.status === "in_progress") running += 1;
      }
    }

    const card: Card = {
      id: plan.id,
      kind: "plan",
      title: plan.title,
      status: plan.status,
      repo,
      track: track === "feature" ? "feature" : track === "pequena" ? "pequena" : "feature",
      tasks: { total, pass, running },
      blocked: blockedPlans.has(plan.id),
    };

    if (plan.status === "done") {
      columns.FEITO.push(card);
    } else if (plan.status === "approved" || plan.status === "active") {
      // Check if all done
      if (total > 0 && pass === total) {
        columns.FEITO.push(card);
      } else if (card.tasks.running > 0) {
        columns.EXECUTANDO.push(card);
      } else {
        columns.PLAN.push(card);
      }
    } else if (plan.status === "verifying") {
      columns.VERIFICANDO.push(card);
    } else {
      columns.PLAN.push(card);
    }
  }

  // Blockers abertos (eventos kind=blocker sem answer).
  for (const blocker of openBlockers) {
    inbox.push({
      id: blocker.id,
      type: "blocker",
      entity: blocker.plan ?? undefined,
      title: typeof blocker.data.question === "string" ? blocker.data.question : blocker.id,
      question: blocker.data.question ?? null,
      raised_by: blocker.data.raised_by ?? null,
      plan: blocker.plan,
      task: blocker.task,
      actions: ["answer"],
    });
  }

  // Alertas do vigia entram no mesmo Inbox, sem ações de escrita.
  for (const alert of listAlerts(db)) {
    inbox.push({
      id: alert.id,
      type: "alerta",
      entity: alert.entity,
      title: alert.summary,
      severity: alert.severity,
      ...(alert.plan ? { plan: alert.plan } : {}),
      actions: [],
    });
  }

  // Budget cap.
  try {
    for (const row of db.query("SELECT id, plan, task, json FROM events WHERE kind = 'budget' ORDER BY ts").all() as Array<Record<string, any>>) {
      const data = eventData(row);
      if (data.level !== "cap") continue;
      inbox.push({
        id: String(row.id),
        type: "budget",
        entity: row.plan ?? undefined,
        title: `budget cap ${row.plan ?? ""}`.trim(),
        plan: row.plan ?? null,
        task: row.task ?? null,
        actions: ["budget raise"],
      });
    }
  } catch {
    // ignore
  }

  // Decisões pendentes (tasks escaladas).
  if (tableExists(db, "task_exec")) {
    try {
      for (const row of db.query("SELECT plan, task FROM task_exec WHERE status = 'escalated'").all() as Array<Record<string, any>>) {
        inbox.push({
          id: `${row.plan}/${row.task}`,
          type: "decidir",
          entity: row.plan ?? undefined,
          title: `${row.plan}/${row.task}`,
          plan: row.plan ?? null,
          task: row.task ?? null,
          actions: ["decide"],
        });
      }
    } catch {
      // ignore
    }
  }

  // Learnings a promover: PLAN fechado (done) com LEARNINGS.md ainda não promovidos
  // vira item "promover?" com a lista de pendentes (PLAN-0013 TASK-05/TASK-27, AC do judge).
  for (const plan of plans) {
    if (plan.status !== "done" || !plan.dir) continue;
    const pending = listLearnings(plan.dir).filter((l) => !l.promoted).map((l) => l.id);
    if (pending.length > 0) {
      inbox.push({ id: plan.id, type: "promover?", entity: plan.id, title: plan.title, plan: plan.id, pending, actions: ["promote"] });
    }
  }

  // Learnings a promover (eventos learning não promovidos).
  try {
    for (const row of db.query("SELECT id, plan, task, json FROM events WHERE kind = 'learning' ORDER BY ts").all() as Array<Record<string, any>>) {
      const data = eventData(row);
      if (data.promoted === true) continue;
      const lid = typeof data.learning_id === "string" ? data.learning_id : String(row.id);
      inbox.push({
        id: lid,
        type: "promover",
        entity: row.plan ?? undefined,
        title: lid,
        plan: row.plan ?? null,
        task: row.task ?? null,
        actions: ["promote"],
      });
    }
  } catch {
    // ignore
  }

  return { columns, inbox };
}

