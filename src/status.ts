// status.ts — ginga status --json (PLAN-0012 TASK-10/T323): estado do harness a
// partir do bundle + state.db, sem LLM e sem gravar nada. Contrato: PLAN.md
// "Interfaces" (Status) e tests/status_json.test.ts (frozen).

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import type { Database } from "bun:sqlite";
import { deriveBoard, type InboxItem } from "./board";
import { listAlerts, type Alert, type AlertSeverity } from "./alerts";

export type Status = {
  schema_version: 1;
  generated_at: string;
  owner: InboxItem[];
  plans: Array<{
    id: string;
    status: string;
    tasks: { total: number; pass: number; open: number };
    attempts: number;
    cost_usd: number;
  }>;
  alerts: Record<AlertSeverity, number>;
  broken_sources: Array<{ source: string; error: string }>;
};

function record(value: unknown): Record<string, unknown> {
  if (typeof value === "string") {
    try {
      return record(JSON.parse(value));
    } catch {
      return {};
    }
  }
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function fmGet(raw: string, key: string): string | undefined {
  const m = new RegExp(`^${key}:\\s*(.+)$`, "m").exec(raw);
  return m ? m[1].trim().replace(/^["']|["']$/g, "") : undefined;
}

/** PLANs do bundle (root/plans/PLAN-NNNN-slug/PLAN.md), sem os superseded. */
function listPlans(root: string): Array<{ id: string; status: string }> {
  const plansDir = join(root, "plans");
  const out: Array<{ id: string; status: string }> = [];
  if (!existsSync(plansDir)) return out;
  for (const entry of readdirSync(plansDir).sort()) {
    const m = /^PLAN-\d{4}/.exec(entry);
    if (!m) continue;
    // Mesma convenção do listBundle (src/board.ts): PLAN-NNNN-slug/PLAN.md.
    const file = join(plansDir, entry, "PLAN.md");
    if (!existsSync(file)) continue;
    const raw = readFileSync(file, "utf8");
    const status = fmGet(raw, "status") ?? "draft";
    if (status === "superseded") continue;
    out.push({ id: m[0], status });
  }
  return out;
}

function tableExists(db: Database, name: string): boolean {
  try {
    return db.query("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(name) !== null;
  } catch {
    return false;
  }
}

/** tasks do task_exec + attempts/custo dos eventos `attempt` do PLAN. */
function planStats(db: Database, planId: string): { tasks: Status["plans"][number]["tasks"]; attempts: number; cost_usd: number } {
  const tasks = { total: 0, pass: 0, open: 0 };
  let attempts = 0;
  let cost_usd = 0;
  if (tableExists(db, "task_exec")) {
    const rows = db
      .query("SELECT status FROM task_exec WHERE plan = ?")
      .all(planId) as Array<{ status: string | null }>;
    tasks.total = rows.length;
    for (const row of rows) {
      if (String(row.status ?? "").toLowerCase() === "pass") tasks.pass += 1;
      else tasks.open += 1;
    }
  }
  if (tableExists(db, "events")) {
    const rows = db
      .query("SELECT json FROM events WHERE kind = 'attempt' AND plan = ?")
      .all(planId) as Array<{ json: string }>;
    attempts = rows.length;
    for (const row of rows) {
      const data = record(record(row.json).data);
      const c = Number(data.cost_usd);
      if (Number.isFinite(c)) cost_usd += c;
    }
  }
  return { tasks, attempts, cost_usd };
}

/** Relógio padrão determinístico: último ts dos eventos do state.db (ou epoch),
 *  para a CLI e o runVerb produzirem JSON idêntico sobre o mesmo db (tests de
 *  PLAN-0011). Quem chama com `now` explícito (teste) usa o relógio dado. */
function defaultNow(db: Database): () => Date {
  return () => {
    if (tableExists(db, "events")) {
      const row = db.query("SELECT MAX(ts) AS m FROM events").get() as { m: string | null } | null;
      if (row?.m) {
        const ms = Date.parse(row.m);
        if (Number.isFinite(ms)) return new Date(ms);
      }
    }
    return new Date(0);
  };
}

export function buildStatus(root: string, db: Database, now?: () => Date): Status {
  const clock = now ?? defaultNow(db);
  const generated = clock();
  const owner = deriveBoard(root, db).inbox;
  const plans = listPlans(root).map((p) => ({ id: p.id, status: p.status, ...planStats(db, p.id) }));

  // Alertas das últimas 24 h, por severidade.
  const since = new Date(generated.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const alerts: Record<AlertSeverity, number> = { info: 0, warn: 0, high: 0, critical: 0 };
  for (const a of listAlerts(db, { since })) alerts[a.severity] += 1;

  // Fontes que falharam ao ler — reporta o erro sem abortar.
  // Contrato TASK-11/T324: o caminho de eventos resolve igual nos dois lados
  // (CLI e runVerb) — $GINGA_EVENTS quando definida, senão `events.jsonl` no
  // diretório do state.db (db.filename) — para a paridade do JSON.
  const broken_sources: Status["broken_sources"] = [];
  const envEvents = process.env.GINGA_EVENTS;
  const dbFile = (db as unknown as { filename?: string }).filename;
  const eventsPath =
    envEvents && envEvents !== ""
      ? envEvents
      : dbFile && dbFile !== ":memory:"
        ? join(dirname(dbFile), "events.jsonl")
        : undefined;
  if (eventsPath && !existsSync(eventsPath)) {
    // basename no erro: a paridade CLI × runVerb (cli_verbs frozen) compara
    // fixtures em diretórios temporários distintos — só o nome do arquivo é igual.
    broken_sources.push({ source: "GINGA_EVENTS", error: `arquivo não existe: ${basename(eventsPath)}` });
  }

  return { schema_version: 1, generated_at: generated.toISOString(), owner, plans, alerts, broken_sources };
}

export type { Alert };
