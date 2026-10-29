// Verbos de escrita (doc 05 §2): mudam frontmatter do bundle, state.db ou
// ambos, e sempre passam por audit.ts (linha no log.md do PLAN + evento).
// Nenhuma regra fora do registro: este módulo só é chamado via runVerb.

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Database } from "bun:sqlite";
import { appendLog, emitAnswer, emitTransition } from "./audit";
import type { VerbArgs, VerbCtx } from "./registry";

// ---------------------------------------------------------------------------
// Tabelas próprias dos verbos (criadas com IF NOT EXISTS, além do schema do
// state.db da PLAN-0010): respostas, decisões e controle de execução.
// ---------------------------------------------------------------------------

const VERB_TABLES = `
CREATE TABLE IF NOT EXISTS answers (
  blocker_id TEXT NOT NULL,
  answer TEXT NOT NULL,
  "by" TEXT NOT NULL,
  via TEXT,
  ts TEXT
);
CREATE TABLE IF NOT EXISTS decisions (
  item TEXT NOT NULL,
  option TEXT NOT NULL,
  "by" TEXT NOT NULL,
  via TEXT,
  ts TEXT
);
CREATE TABLE IF NOT EXISTS ctl (
  scope TEXT PRIMARY KEY,
  paused INTEGER NOT NULL DEFAULT 0,
  cancelled INTEGER NOT NULL DEFAULT 0,
  budget_usd REAL,
  tier TEXT
);
`;

export function ensureTables(db: Database): void {
  db.run(VERB_TABLES);
}

/** INSERT ... ON CONFLICT(scope) atualizando só as colunas dadas. */
function ctlSet(db: Database, scope: string, values: Record<string, number | string>): void {
  const keys = Object.keys(values);
  const cols = ["scope", ...keys];
  const placeholders = cols.map(() => "?").join(", ");
  const updates = keys.map((k) => `${k} = excluded.${k}`).join(", ");
  db.query(`INSERT INTO ctl (${cols.join(", ")}) VALUES (${placeholders}) ON CONFLICT(scope) DO UPDATE SET ${updates}`)
    .run(scope, ...keys.map((k) => values[k]!));
}

// ---------------------------------------------------------------------------
// Frontmatter: os artefatos têm YAML plano `chave: valor`; para status/title
// basta linha a linha, sem dependência nova.
// ---------------------------------------------------------------------------

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(\r?\n[\s\S]*)?$/;

export function fmGet(raw: string, field: string): string | null {
  const m = raw.match(FRONTMATTER);
  if (!m) return null;
  const line = new RegExp(`^${field}:[ \\t]*(.*)$`, "m").exec(m[1] ?? "");
  if (!line) return null;
  return (line[1] ?? "").trim().replace(/^["'](.*)["']$/, "$1");
}

export function fmSet(raw: string, field: string, value: string): string {
  const m = raw.match(FRONTMATTER);
  if (!m) return `---\n${field}: ${value}\n---\n${raw}`;
  const body = m[2] ?? "\n";
  const block = m[1] ?? "";
  const re = new RegExp(`^${field}:.*$`, "m");
  const updated = re.test(block) ? block.replace(re, `${field}: ${value}`) : `${block}\n${field}: ${value}`;
  return `---\n${updated}\n---${body}`;
}

// ---------------------------------------------------------------------------
// Localização de artefato pelo id (PLAN-NNNN em diretório; SPEC/INTENT em arquivo).
// ---------------------------------------------------------------------------

export type Artifact = {
  id: string;
  kind: "intent" | "spec" | "plan";
  file: string;
  dir: string | null;
};

const ID_RE = /^(INTENT|SPEC|PLAN)-(\d{4})\b/;

export function findArtifact(root: string, id: string): Artifact | null {
  const m = ID_RE.exec(id.trim().toUpperCase());
  if (!m) return null;
  const prefix = `${m[1]}-${m[2]}`;
  const kind = m[1]!.toLowerCase() as Artifact["kind"];
  if (kind === "plan") {
    const plansDir = join(root, "plans");
    if (!existsSync(plansDir)) return null;
    for (const entry of readdirSync(plansDir).sort()) {
      if (!entry.startsWith(`${prefix}-`)) continue;
      const dir = join(plansDir, entry);
      const file = join(dir, "PLAN.md");
      if (existsSync(file)) return { id: prefix, kind, file, dir };
    }
    return null;
  }
  const subdir = kind === "spec" ? "specs" : "intents";
  const base = join(root, subdir);
  if (!existsSync(base)) return null;
  for (const entry of readdirSync(base).sort()) {
    if (!entry.endsWith(".md") || entry === "index.md") continue;
    if (entry.startsWith(`${prefix}-`)) return { id: prefix, kind, file: join(base, entry), dir: null };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Verbos
// ---------------------------------------------------------------------------

function slugify(text: string): string {
  const slug = text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
  return slug !== "" ? slug : "intent";
}

export function intentNew(ctx: VerbCtx, args: VerbArgs): unknown {
  const text = args.text!;
  const intents = join(ctx.root, "intents");
  mkdirSync(intents, { recursive: true });

  let next = 1;
  for (const entry of readdirSync(intents)) {
    const m = /^INTENT-(\d{4})/.exec(entry);
    if (m) next = Math.max(next, Number(m[1]) + 1);
  }
  const id = `INTENT-${String(next).padStart(4, "0")}`;
  const title = text.trim().split("\n")[0] ?? id;
  const file = join(intents, `${id}-${slugify(text)}.md`);
  writeFileSync(
    file,
    `---\ntype: intent\ntitle: ${title}\nsource: ${ctx.via}\ntimestamp: ${new Date().toISOString()}\n---\n${text.trim()}\n`,
  );
  return { id, file: file.slice(ctx.root.length + 1), title, source: ctx.via };
}

/** approve/reject: gate de frontmatter do SPEC/PLAN + log + transition. */
function gate(ctx: VerbCtx, args: VerbArgs, to: "approved" | "rejected"): unknown {
  const name = to === "approved" ? "approve" : "reject";
  const art = findArtifact(ctx.root, args.id!);
  if (!art) throw new Error(`artefato não encontrado: ${args.id}`);

  const raw = readFileSync(art.file, "utf8");
  const from = fmGet(raw, "status") ?? "draft";
  writeFileSync(art.file, fmSet(raw, "status", to));

  const reason = args.reason ? ` (${args.reason})` : "";
  appendLog(ctx, art.dir, art.id, `${name} ${art.id}: ${from} → ${to}${reason}`);
  emitTransition(ctx, {
    entity: art.kind,
    from,
    to,
    plan: art.kind === "plan" ? art.id : null,
  });
  return { id: art.id, entity: art.kind, status: to, from };
}

export function approve(ctx: VerbCtx, args: VerbArgs): unknown {
  return gate(ctx, args, "approved");
}

export function reject(ctx: VerbCtx, args: VerbArgs): unknown {
  return gate(ctx, args, "rejected");
}

/** answer: state.db + seção "Respostas" do artefato do blocker + log + evento. */
export function answer(ctx: VerbCtx, args: VerbArgs): unknown {
  ensureTables(ctx.db);
  const rows = ctx.db
    .query("SELECT id, ts, plan, task, json FROM events WHERE kind = 'blocker' ORDER BY ts")
    .all() as Array<Record<string, any>>;

  let found: { plan: string | null; task: string | null } | null = null;
  for (const row of rows) {
    let parsed: any;
    try {
      parsed = JSON.parse(String(row.json));
    } catch {
      continue;
    }
    const data = parsed?.data ?? parsed;
    if (data && data.blocker_id === args.blocker_id) {
      found = { plan: row.plan ?? null, task: row.task ?? null };
      break;
    }
  }
  if (!found) throw new Error(`blocker desconhecido: ${args.blocker_id}`);

  const ts = new Date().toISOString();
  ctx.db
    .query('INSERT INTO answers (blocker_id, answer, "by", via, ts) VALUES (?, ?, ?, ?, ?)')
    .run(args.blocker_id, args.text, ctx.by, ctx.via, ts);

  if (found.plan) {
    const art = findArtifact(ctx.root, found.plan);
    if (art) {
      const raw = readFileSync(art.file, "utf8");
      let updated = raw.replace(/\s+$/, "");
      if (!updated.includes("## Respostas")) updated += "\n\n## Respostas\n";
      updated += `\n- ${ts} \`${args.blocker_id}\` → ${args.text} (by ${ctx.by} via ${ctx.via})\n`;
      writeFileSync(art.file, updated);
      appendLog(ctx, art.dir, art.id, `answer ${args.blocker_id} → ${args.text}`);
    }
  }

  emitAnswer(ctx, { blocker_id: args.blocker_id!, answer: args.text!, plan: found.plan, task: found.task });
  return { blocker_id: args.blocker_id, plan: found.plan, task: found.task, answered: true };
}

/** decide: escolha de uma opção do Inbox — só state.db. */
export function decide(ctx: VerbCtx, args: VerbArgs): unknown {
  ensureTables(ctx.db);
  const ts = new Date().toISOString();
  ctx.db
    .query('INSERT INTO decisions (item, option, "by", via, ts) VALUES (?, ?, ?, ?, ?)')
    .run(args.item, args.option, ctx.by, ctx.via, ts);
  return { item: args.item, option: args.option, recorded: true };
}

/** pause/resume: fila inteira (scope `*`) ou um PLAN. Só ctl + linha no log quando tem PLAN. */
export function setPaused(ctx: VerbCtx, args: VerbArgs, paused: 0 | 1): unknown {
  ensureTables(ctx.db);
  const scope = args.plan ?? "*";
  ctlSet(ctx.db, scope, { paused });
  if (args.plan) {
    const art = findArtifact(ctx.root, args.plan);
    appendLog(ctx, art?.dir ?? null, art?.id ?? args.plan, `${paused === 1 ? "pause" : "resume"} ${scope}`);
  }
  return { scope, paused: paused === 1 };
}

/** retry: task volta à fila (lease solto, attempts preservadas); --tier vai no ctl. */
export function retry(ctx: VerbCtx, args: VerbArgs): unknown {
  ensureTables(ctx.db);
  const scope = `${args.plan}/${args.task}`;
  const row = ctx.db
    .query("SELECT status FROM task_exec WHERE plan = ? AND task = ?")
    .get(args.plan, args.task) as { status: string | null } | null;
  if (!row) throw new Error(`task não encontrada: ${scope}`);
  const from = row.status ?? "pending";

  ctx.db
    .query("UPDATE task_exec SET status = 'retry', lease_owner = NULL, lease_until = NULL WHERE plan = ? AND task = ?")
    .run(args.plan, args.task);
  if (args.tier) ctlSet(ctx.db, scope, { tier: args.tier });

  const art = findArtifact(ctx.root, args.plan!);
  appendLog(ctx, art?.dir ?? null, art?.id ?? args.plan!, `retry ${scope}${args.tier ? ` tier ${args.tier}` : ""}`);
  emitTransition(ctx, { entity: "task", from, to: "retry", plan: args.plan, task: args.task });
  return { scope, status: "retry", from, tier: args.tier ?? null };
}

/** escalate: task sobe para o dono decidir; só status no state.db + transição. */
export function escalate(ctx: VerbCtx, args: VerbArgs): unknown {
  ensureTables(ctx.db);
  const scope = `${args.plan}/${args.task}`;
  const row = ctx.db
    .query("SELECT status FROM task_exec WHERE plan = ? AND task = ?")
    .get(args.plan, args.task) as { status: string | null } | null;
  if (!row) throw new Error(`task não encontrada: ${scope}`);
  const from = row.status ?? "pending";

  ctx.db
    .query("UPDATE task_exec SET status = 'escalated', lease_owner = NULL, lease_until = NULL WHERE plan = ? AND task = ?")
    .run(args.plan, args.task);
  const art = findArtifact(ctx.root, args.plan!);
  appendLog(ctx, art?.dir ?? null, art?.id ?? args.plan!, `escalate ${scope}`);
  emitTransition(ctx, { entity: "task", from, to: "escalated", plan: args.plan, task: args.task });
  return { scope, status: "escalated", from };
}

/** cancel: marca o PLAN no ctl (o dispatcher para deCLAIMAR tasks) + log. */
export function cancel(ctx: VerbCtx, args: VerbArgs): unknown {
  ensureTables(ctx.db);
  ctlSet(ctx.db, args.plan!, { cancelled: 1 });
  const art = findArtifact(ctx.root, args.plan!);
  appendLog(ctx, art?.dir ?? null, art?.id ?? args.plan!, `cancel ${args.plan}`);
  return { scope: args.plan, cancelled: true };
}

/** budget raise: libera um teto maior para o PLAN (só state.db + log). */
export function budgetRaise(ctx: VerbCtx, args: VerbArgs): unknown {
  ensureTables(ctx.db);
  const usd = Number((args.usd ?? "").trim());
  if (!Number.isFinite(usd) || usd < 0) throw new Error(`budget raise: valor inválido: ${JSON.stringify(args.usd)}`);
  ctlSet(ctx.db, args.plan!, { budget_usd: usd });
  const art = findArtifact(ctx.root, args.plan!);
  appendLog(ctx, art?.dir ?? null, art?.id ?? args.plan!, `budget raise ${args.plan} → US$${usd}`);
  return { scope: args.plan, budget_usd: usd };
}
