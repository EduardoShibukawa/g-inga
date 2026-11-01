// Verbos de leitura (doc 05 §2): status, board, inbox, watch.
// Não escrevem nada — nem tabela, nem log, nem evento. O contrato vive nos
// arquivos do bundle (frontmatter); a execução vive no state.db.

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fmGet } from "./write";
import { listLearnings } from "../lessons.ts";
import type { VerbArgs, VerbCtx } from "./registry";

type Listed = { id: string; kind: "intent" | "spec" | "plan"; status: string; title: string; file: string };

const KIND_DIRS = [
  { kind: "intent" as const, subdir: "intents", inDir: false },
  { kind: "spec" as const, subdir: "specs", inDir: false },
  { kind: "plan" as const, subdir: "plans", inDir: true },
];

function listBundle(root: string): Listed[] {
  const out: Listed[] = [];
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
        file, // caminho do arquivo do artefato (interno; status/board não o projetam)
      });
    }
  }
  return out;
}

function parseJson(value: unknown): Record<string, unknown> {
  try {
    const parsed = JSON.parse(String(value));
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function blockerData(row: Record<string, any>): Record<string, any> {
  const data = parseJson(row.json).data;
  return data && typeof data === "object" ? (data as Record<string, any>) : parseJson(row.json);
}

/** status: visão por artefato (intents/specs/plans com seu status). */
export function status(ctx: VerbCtx): unknown {
  const all = listBundle(ctx.root);
  const group = (kind: Listed["kind"]) =>
    all.filter((a) => a.kind === kind).map(({ id, status: s, title }) => ({ id, status: s, title }));
  return { intents: group("intent"), specs: group("spec"), plans: group("plan") };
}

/** board: colunas por status (o quadro da Roda), PLANs e SPECs. */
export function board(ctx: VerbCtx): unknown {
  const columns: Record<string, string[]> = {};
  for (const a of listBundle(ctx.root)) {
    if (a.kind === "intent") continue;
    (columns[a.status] ??= []).push(a.id);
  }
  return { columns };
}

function tableExists(ctx: VerbCtx, name: string): boolean {
  return ctx.db.query("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(name) !== null;
}

/** inbox: o que espera o dono — aprovação de SPEC/PLAN e blocker sem resposta. */
export function inbox(ctx: VerbCtx): unknown {
  const items: Array<Record<string, unknown>> = [];
  for (const a of listBundle(ctx.root)) {
    if (a.kind === "intent") continue;
    if (a.status === "draft") items.push({ id: a.id, type: "aprovar", entity: a.kind, title: a.title, status: a.status });
    // PLAN fechado (done) com learnings ainda não promovidos → item "promover?"
    // (PLAN-0013 TASK-05/TASK-27, achado do judge 2026-11-01).
    if (a.kind === "plan" && a.status === "done") {
      const pending = listLearnings(dirname(a.file))
        .filter((l) => !l.promoted)
        .map((l) => l.id);
      if (pending.length > 0) items.push({ id: a.id, type: "promover?", plan: a.id, pending });
    }
  }

  const answered = new Set<string>();
  if (tableExists(ctx, "answers")) {
    for (const row of ctx.db.query('SELECT "blocker_id" FROM answers').all() as Array<Record<string, any>>) {
      answered.add(String(row.blocker_id));
    }
  }
  for (const row of ctx.db.query("SELECT id, ts, plan, task, json FROM events WHERE kind = 'blocker' ORDER BY ts").all() as Array<Record<string, any>>) {
    const data = blockerData(row);
    const blockerId = typeof data.blocker_id === "string" ? data.blocker_id : null;
    if (!blockerId || answered.has(blockerId)) continue;
    items.push({ id: blockerId, type: "blocker", question: data.question ?? null, raised_by: data.raised_by ?? null, plan: row.plan ?? null, task: row.task ?? null });
  }
  return { items };
}

/** watch: histórico do alvo no state.db — PLAN-NNNN, TASK-NN ou PLAN-NNNN/TASK-NN. */
export function watch(ctx: VerbCtx, args: VerbArgs): unknown {
  const target = args.target!.trim();
  let rows: Array<Record<string, any>>;
  if (target.includes("/")) {
    const [plan, task] = target.split("/", 2);
    rows = ctx.db
      .query("SELECT id, ts, kind, plan, task, json FROM events WHERE plan = ? AND task = ? ORDER BY ts, id")
      .all(plan, task) as Array<Record<string, any>>;
  } else if (/^PLAN-\d{4}$/.test(target)) {
    rows = ctx.db.query("SELECT id, ts, kind, plan, task, json FROM events WHERE plan = ? ORDER BY ts, id").all(target) as Array<Record<string, any>>;
  } else {
    rows = ctx.db.query("SELECT id, ts, kind, plan, task, json FROM events WHERE task = ? ORDER BY ts, id").all(target) as Array<Record<string, any>>;
  }
  return { events: rows.map((row) => ({ id: row.id, ts: row.ts, kind: row.kind, plan: row.plan, task: row.task, event: parseJson(row.json) })) };
}
