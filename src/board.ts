// board.ts - modelo único do quadro e do Inbox (PLAN-0012 TASK-01)

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Database } from "bun:sqlite";
import { fmGet } from "./verbs/write";

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
  type: "blocker" | "aprovar" | "budget" | "decidir" | "promover" | "alerta";
  entity?: string;
  title?: string;
  severity?: "info" | "warn" | "high" | "critical";
  actions?: string[];
  question?: string;
  raised_by?: string;
  plan?: string | null;
  task?: string | null;
  status?: string;
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
      blocked: false,
    };

    if (plan.status === "approved" || plan.status === "active") {
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

  return { columns, inbox };
}
