import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

export const HANDOFF_AB_EXPERIMENT = "handoff-ab";
export const HANDOFF_AB_ARMS = ["native-compact", "ginga-handoff"] as const;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS experiment (
  id TEXT PRIMARY KEY,
  methodology_version INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS arm (
  experiment TEXT NOT NULL,
  id TEXT NOT NULL,
  PRIMARY KEY (experiment, id),
  FOREIGN KEY (experiment) REFERENCES experiment(id)
);
CREATE TABLE IF NOT EXISTS run (
  id TEXT PRIMARY KEY,
  arm TEXT NOT NULL,
  task TEXT NOT NULL,
  started TEXT NOT NULL,
  ended TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS event (
  run TEXT NOT NULL,
  ts TEXT NOT NULL,
  kind TEXT NOT NULL,
  json TEXT NOT NULL,
  PRIMARY KEY (run, ts, kind, json),
  FOREIGN KEY (run) REFERENCES run(id)
);
`;

/** Caminho padrão do bench; o chamador pode injetar outro arquivo. */
export function benchDbPath(): string {
  return join(process.cwd(), ".ginga", "state", "bench.db");
}

/** Abre o bench próprio e registra o experimento handoff-ab v1. */
export function openBench(path: string = benchDbPath()): Database {
  mkdirSync(dirname(path), { recursive: true });
  const bench = new Database(path);
  bench.run("PRAGMA foreign_keys = ON");
  bench.run(SCHEMA);
  bench.run("INSERT OR IGNORE INTO experiment(id, methodology_version) VALUES(?, 1)", [
    HANDOFF_AB_EXPERIMENT,
  ]);
  const insertArm = bench.prepare("INSERT OR IGNORE INTO arm(experiment, id) VALUES(?, ?)");
  for (const arm of HANDOFF_AB_ARMS) insertArm.run(HANDOFF_AB_EXPERIMENT, arm);
  return bench;
}
