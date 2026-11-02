import { Database } from "bun:sqlite";
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

/** Importa cada sessão como um evento cost idempotente por session_id. */
export function syncCost(db: Database, sessions: OcSession[]): { emitted: number } {
  const seen = existingCostSessionIds(db);
  const insert = db.prepare(
    "INSERT INTO events(id, ts, kind, plan, task, json) VALUES(?, ?, 'cost', NULL, NULL, ?)",
  );
  let emitted = 0;
  for (const session of sessions) {
    if (seen.has(session.id)) continue;
    const provider = session.model.includes("/") ? session.model.slice(0, session.model.indexOf("/")) : session.model;
    const event = {
      v: 1,
      ts: new Date().toISOString(),
      source: "ginga",
      kind: "cost",
      id: ulid(),
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
    insert.run(event.id, event.ts, JSON.stringify(event));
    seen.add(session.id);
    emitted += 1;
  }
  return { emitted };
}
