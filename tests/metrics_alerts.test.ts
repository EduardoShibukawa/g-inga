// PLAN-0014 TASK-08 (tests_frozen): métricas por regra do vigia.
// Fixture: 3 alertas infra_stuck (resolvidos em 10 e 30 min, 1 aberto),
// 1 budget_cap (resolvido em 20 min), com custos por entidade.
// Import dinâmico para o RED falhar por asserção (módulo ausente).

import { afterEach, describe, expect, test } from "bun:test";
import type { Database } from "bun:sqlite";
import { mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openStateDb } from "../src/state/db";

type RuleMetrics = {
  rule_id: string;
  count: number;
  open: number;
  mttr_min: number | null;
  cost_usd: number;
};

const ROOT = join(import.meta.dir, "..");
const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function fixtureDb(): Database {
  const dir = realpathSync(mkdtempSync(join(realpathSync(tmpdir()), "ginga-alert-metrics-")));
  dirs.push(dir);
  const db = openStateDb(join(dir, "state.db"));
  const insert = db.prepare("INSERT INTO events(id, ts, kind, plan, task, json) VALUES(?, ?, ?, ?, ?, ?)");
  const path = join(ROOT, "tests", "fixtures", "metrics-alerts.jsonl");
  for (const line of readFileSync(path, "utf8").split("\n").filter((item) => item.trim() !== "")) {
    const event = JSON.parse(line) as {
      id: string;
      ts: string;
      kind: string;
      plan?: string;
      task?: string;
    };
    insert.run(
      event.id,
      event.ts,
      event.kind,
      event.plan ?? null,
      event.task ?? null,
      line,
    );
  }
  return db;
}

async function loadAlertMetrics(): Promise<(db: Database, options?: { since?: string }) => RuleMetrics[]> {
  const mod = await import("../src/metrics_alerts").catch(() => null);
  expect(mod).not.toBeNull();
  return (mod as unknown as { alertMetrics: (db: Database, options?: { since?: string }) => RuleMetrics[] }).alertMetrics;
}

describe("PLAN-0014 TASK-08 — métricas do vigia", () => {
  test("contagem, abertos, MTTR e custo por alerta", async () => {
    const alertMetrics = await loadAlertMetrics();
    const db = fixtureDb();
    const rows = alertMetrics(db);
    db.close();

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      rule_id: "infra_stuck",
      count: 3,
      open: 1,
      mttr_min: 20,
    });
    expect(rows[0]!.cost_usd).toBeCloseTo(3.5, 10);
    expect(rows[1]).toMatchObject({
      rule_id: "budget_cap",
      count: 1,
      open: 0,
      mttr_min: 20,
      cost_usd: 4,
    });
  });

  test("--since exclui alertas anteriores à janela", async () => {
    const alertMetrics = await loadAlertMetrics();
    const db = fixtureDb();
    const rows = alertMetrics(db, { since: "2026-11-02T00:00:00.000Z" });
    db.close();
    expect(rows).toEqual([]);
  });
});
