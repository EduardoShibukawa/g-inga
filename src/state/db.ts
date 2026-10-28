// state.db (PLAN-0010 TASK-01): guarda a execução, não o contrato
// (doc 04 §5). Tabelas criadas com IF NOT EXISTS para reabrir sem apagar dados.

import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

/** Caminho do db: $GINGA_STATE_DB, senão `<cwd>/.ginga/state/state.db`. */
export function stateDbPath(): string {
  const env = process.env.GINGA_STATE_DB;
  if (env && env !== "") return env;
  return join(process.cwd(), ".ginga", "state", "state.db");
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS task_exec (
  plan TEXT NOT NULL,
  task TEXT NOT NULL,
  status TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  lease_owner TEXT,
  lease_until TEXT,
  PRIMARY KEY (plan, task)
);
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  ts TEXT,
  kind TEXT,
  plan TEXT,
  task TEXT,
  json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS offsets (
  path TEXT PRIMARY KEY,
  byte INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS plan_thread (
  plan TEXT NOT NULL,
  target TEXT NOT NULL,
  thread_id TEXT,
  PRIMARY KEY (plan, target)
);
`;

/** Abre (criando se preciso) o state.db no caminho dado. */
export function openStateDb(path?: string): Database {
  const p = path ?? stateDbPath();
  mkdirSync(join(p, ".."), { recursive: true });
  const db = new Database(p);
  db.run(SCHEMA);
  return db;
}
