// PLAN-0014 TASK-01 (tests_frozen): computeMetrics(db, {since}) a partir do state.db.
// Fixture: tests/fixtures/metrics/events.jsonl — 4 TASKs em 2026-11 mais 1 antiga (T-OLD):
//   T-OLD pass de primeira (2026-10, fora de --since=2026-11), T-A pass de primeira com
//   evento cost próprio (4.0) que deve vencer attempt.cost_usd (1.0), T-B falha done_when
//   (medium) e passa na 2ª (strong, escalation), T-C falha quota_exhausted e passa na 2ª,
//   T-D só falha infra. + 1 evento cost de sessão (escopo call, sem task).
// Import dinâmico para o RED falhar por asserção (módulo ausente), não por erro de resolução.

import { afterEach, describe, expect, test } from "bun:test";
import type { Database } from "bun:sqlite";
import { mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openStateDb } from "../src/state/db";
import type { Metrics } from "../src/metrics";

const ROOT = join(import.meta.dir, "..");
const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

async function loadComputeMetrics(): Promise<(db: Database, o?: { since?: string }) => Metrics> {
  const mod = await import("../src/metrics").catch(() => null);
  expect(mod).not.toBeNull();
  return (mod as unknown as { computeMetrics: (db: Database, o?: { since?: string }) => Metrics }).computeMetrics;
}

function loadFixtureDb(): string {
  const dir = realpathSync(mkdtempSync(join(realpathSync(tmpdir()), "ginga-metrics-")));
  dirs.push(dir);
  const dbPath = join(dir, "state.db");
  const db = openStateDb(dbPath);
  const lines = readFileSync(join(ROOT, "tests", "fixtures", "metrics", "events.jsonl"), "utf8")
    .split("\n")
    .filter((l) => l.trim() !== "");
  const insert = db.prepare("INSERT INTO events(id, ts, kind, plan, task, json) VALUES(?, ?, ?, ?, ?, ?)");
  for (const line of lines) {
    const ev = JSON.parse(line) as { id: string; ts: string; kind: string; plan?: string; task?: string };
    insert.run(ev.id, ev.ts, ev.kind, ev.plan ?? null, ev.task ?? null, line);
  }
  db.close();
  return dbPath;
}

describe("PLAN-0014 TASK-01 — computeMetrics", () => {
  test("FTPR por modelo/tier/all exclui attempts quota_exhausted e infra; custo do evento cost vence attempt.cost_usd", async () => {
    const computeMetrics = await loadComputeMetrics();
    const db = openStateDb(loadFixtureDb());
    const m = computeMetrics(db);
    db.close();

    // T-OLD, T-A, T-B, T-C tentadas (T-D só tem infra → fora do FTPR); pass de 1ª: T-OLD e T-A.
    expect(m.ftpr["all"]).toBeCloseTo(2 / 4, 10);
    expect(m.ftpr["model:opencode/glm-5.3-flash-free"]).toBeCloseTo(2 / 4, 10);
    expect(m.ftpr["tier:medium"]).toBeCloseTo(2 / 3, 10); // T-OLD, T-A, T-B
    expect(m.ftpr["tier:free"]).toBe(0); // T-C: 1ª attempt foi quota (excluída), passa na 2ª
    // T-A: cost do evento (4.0) vence attempt.cost_usd (1.0); T-B: 0.5+2.0; T-OLD/T-C: 0.
    // Verificadas (receipt pass): 4 → (4.0 + 2.5 + 0 + 0) / 4 = 1.625
    expect(m.cost_per_verified_task_usd).toBeCloseTo(1.625, 10);
    expect(m.spent_usd).toBeCloseTo(5.5, 10); // 4.0 (task T-A) + 1.5 (sessão)
    expect(m.failures_by_reason).toEqual({ done_when: 1, quota_exhausted: 1, infra: 1 });
    expect(m.escalations).toBe(1); // T-B medium → strong
  });

  test("--since filtra eventos pelo ts (T-OLD de 2026-10 cai fora)", async () => {
    const computeMetrics = await loadComputeMetrics();
    const db = openStateDb(loadFixtureDb());
    const m = computeMetrics(db, { since: "2026-11-01T00:00:00.000Z" });
    db.close();

    expect(m.ftpr["all"]).toBeCloseTo(1 / 3, 10); // só T-A passa de 1ª entre T-A/T-B/T-C
    expect(m.ftpr["tier:medium"]).toBeCloseTo(1 / 2, 10);
    expect(m.ftpr["tier:free"]).toBe(0);
    // Verificadas: 3 → (4.0 + 2.5 + 0) / 3
    expect(m.cost_per_verified_task_usd).toBeCloseTo(6.5 / 3, 10);
    expect(m.spent_usd).toBeCloseTo(5.5, 10);
    expect(m.failures_by_reason).toEqual({ done_when: 1, quota_exhausted: 1, infra: 1 });
    expect(m.escalations).toBe(1);
  });

  test("banco vazio devolve zeros sem quebrar", async () => {
    const computeMetrics = await loadComputeMetrics();
    const dir = realpathSync(mkdtempSync(join(realpathSync(tmpdir()), "ginga-metrics-")));
    dirs.push(dir);
    const db = openStateDb(join(dir, "state.db"));
    const m = computeMetrics(db);
    db.close();
    expect(m.ftpr).toEqual({});
    expect(m.cost_per_verified_task_usd).toBe(0);
    expect(m.failures_by_reason).toEqual({});
    expect(m.escalations).toBe(0);
    expect(m.spent_usd).toBe(0);
  });
});
