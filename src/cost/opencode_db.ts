import { Database } from "bun:sqlite";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { ulid } from "../events/emit.ts";

export type OcSession = {
  id: string;
  model: string;
  cost_usd: number;
  tokens_in: number;
  tokens_out: number;
  created: string;
  directory: string;
};

export class OpencodeSchemaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OpencodeSchemaError";
  }
}

type SessionRow = {
  id: string;
  cost: number;
  tokens_input: number;
  tokens_output: number;
  time_created: number;
  directory: string;
  model_data: string | null;
};

const REQUIRED_SESSION_COLUMNS = [
  "id",
  "cost",
  "tokens_input",
  "tokens_output",
  "time_created",
  "directory",
];
const REQUIRED_MESSAGE_COLUMNS = ["session_id", "seq", "time_created", "data"];

function assertColumns(db: Database, table: string, required: string[]): void {
  const rows = db.query(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (rows.length === 0) throw new OpencodeSchemaError(`opencode.db não tem a tabela ${table}`);
  const present = new Set(rows.map((row) => row.name));
  const missing = required.filter((column) => !present.has(column));
  if (missing.length > 0) {
    throw new OpencodeSchemaError(`opencode.db ${table} sem coluna(s): ${missing.join(", ")}`);
  }
}

function parseModel(raw: string | null): { provider: string; model: string } {
  if (!raw) return { provider: "unknown", model: "unknown/unknown" };
  try {
    const data = JSON.parse(raw) as { model?: { id?: unknown; providerID?: unknown } };
    const id = typeof data.model?.id === "string" ? data.model.id : "unknown";
    const provider = typeof data.model?.providerID === "string" ? data.model.providerID : "unknown";
    return { provider, model: `${provider}/${id}` };
  } catch {
    return { provider: "unknown", model: "unknown/unknown" };
  }
}

function isoCreated(timeCreated: number): string {
  return new Date(timeCreated).toISOString();
}

/** Extrai plan e task do diretório da sessão a partir do bundle root.
 *  - componente do caminho com basename `^(.*)-plan-(\d{4})$` (ex.: `ginga-plan-0014`)
 *    → número do PLAN, resolvido para o nome completo em `join(root, "plans")`
 *    (diretório `PLAN-<NNNN>-*` com `PLAN.md`; fallback `PLAN-<NNNN>`);
 *  - trecho `tasks/T(\d+)` no caminho → `task = "T<numero>"`;
 *  - sem esses componentes → `{ plan: null, task: null }`.
 */
export function planTaskForDirectory(
  root: string,
  directory: string,
): { plan: string | null; task: string | null } {
  let plan: string | null = null;
  for (const part of directory.split("/")) {
    const m = part.match(/^(.*)-plan-(\d{4})$/);
    if (!m) continue;
    const planNum = m[2];
    const plansDir = join(root, "plans");
    const entries = existsSync(plansDir) ? readdirSync(plansDir, { withFileTypes: true }) : [];
    const matching = entries.find(
      (e) =>
        e.isDirectory() &&
        e.name.startsWith(`PLAN-${planNum}`) &&
        existsSync(join(plansDir, e.name, "PLAN.md")),
    );
    plan = matching ? matching.name : `PLAN-${planNum}`;
    break;
  }
  const taskMatch = directory.match(/(?:^|\/)tasks\/T(\d+)(?:\/|$)/);
  const task = taskMatch ? `T${taskMatch[1]}` : null;
  return { plan, task };
}

/** Lê sessões do opencode.db sem escrever no banco. */
export function readOpencodeSessions(
  dbPath: string,
  options: { since?: string; ids?: string[] } = {},
): OcSession[] {
  const db = new Database(dbPath, { readonly: true });
  try {
    assertColumns(db, "session_v2", REQUIRED_SESSION_COLUMNS);
    assertColumns(db, "session_message", REQUIRED_MESSAGE_COLUMNS);

    const rows = db
      .query(
        `SELECT s.id, s.cost, s.tokens_input, s.tokens_output, s.time_created, s.directory,
                (SELECT m.data FROM session_message m
                 WHERE m.session_id = s.id
                   AND json_extract(m.data, '$.model.id') IS NOT NULL
                 ORDER BY m.seq ASC, m.time_created ASC, m.id ASC LIMIT 1) AS model_data
         FROM session_v2 s ORDER BY s.time_created ASC, s.id ASC`,
      )
      .all() as SessionRow[];

    const since = options.since ? Date.parse(options.since) : null;
    const wanted = options.ids ? new Set(options.ids) : null;
    return rows
      .filter((row) => wanted === null || wanted.has(row.id))
      .filter((row) => since === null || row.time_created >= since)
      .map((row) => {
        const model = parseModel(row.model_data);
        return {
          id: row.id,
          model: model.model,
          cost_usd: Number(row.cost),
          tokens_in: Number(row.tokens_input),
          tokens_out: Number(row.tokens_output),
          created: isoCreated(Number(row.time_created)),
          directory: row.directory,
        };
      });
  } finally {
    db.close();
  }
}

function existingCostSessionIds(db: Database): Set<string> {
  const rows = db.query("SELECT json FROM events WHERE kind = 'cost'").all() as Array<{ json: string }>;
  const ids = new Set<string>();
  for (const row of rows) {
    try {
      const event = JSON.parse(row.json) as { data?: { session_id?: unknown } };
      if (typeof event.data?.session_id === "string") ids.add(event.data.session_id);
    } catch {
      // Uma linha corrompida não pode impedir a sincronização das demais.
    }
  }
  return ids;
}

/** Importa cada sessão como um evento cost idempotente por session_id.
 *  O evento sai com `ts = session.created` (time_created da sessão no opencode.db,
 *  não a hora do sync). Se `resolve` for passado, grava as colunas plan/task e os
 *  campos plan/task do envelope a partir do diretório da sessão.
 */
export function syncCost(
  db: Database,
  sessions: OcSession[],
  resolve?: (directory: string) => { plan: string | null; task: string | null },
): { emitted: number } {
  const seen = existingCostSessionIds(db);
  const insert = db.prepare(
    "INSERT INTO events(id, ts, kind, plan, task, json) VALUES(?, ?, 'cost', ?, ?, ?)",
  );
  let emitted = 0;
  for (const session of sessions) {
    if (seen.has(session.id)) continue;
    const provider = session.model.includes("/") ? session.model.slice(0, session.model.indexOf("/")) : session.model;
    const { plan, task } = resolve ? resolve(session.directory) : { plan: null, task: null };
    const event = {
      v: 1,
      ts: session.created,
      source: "ginga",
      kind: "cost",
      id: ulid(),
      plan,
      task,
      data: {
        runtime: "opencode",
        scope: "call",
        cost_source: "reported",
        provider,
        model: session.model,
        amount_usd: session.cost_usd,
        tokens_in: session.tokens_in,
        tokens_out: session.tokens_out,
        session_id: session.id,
      },
    };
    insert.run(event.id, event.ts, plan, task, JSON.stringify(event));
    seen.add(session.id);
    emitted += 1;
  }
  return { emitted };
}
