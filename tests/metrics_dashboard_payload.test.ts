// PLAN-0014 TASK-12 (tests_frozen): payload de métricas consumível pela Roda Web.
// 3 tentativas (1 falha), custo por SPEC/PLAN/TASK e 1 alerta do vigia resolvido.

import { afterEach, describe, expect, test } from "bun:test";
import type { Database } from "bun:sqlite";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openStateDb } from "../src/state/db";

type DashboardMetrics = {
  executions: number;
  failure_rate: number;
  cost_by: { spec: Record<string, number>; plan: Record<string, number>; task: Record<string, number> };
  repeated_errors: number;
};

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function fixture(): { db: Database; root: string } {
  const root = realpathSync(mkdtempSync(join(realpathSync(tmpdir()), "ginga-dashboard-metrics-")));
  dirs.push(root);
  const planDir = join(root, "plans", "PLAN-0001");
  mkdirSync(planDir, { recursive: true });
  writeFileSync(
    join(planDir, "PLAN.md"),
    "---\ntype: plan\nid: PLAN-0001\nspec: SPEC-0001\nstatus: approved\n---\n",
  );

  const db = openStateDb(join(root, "state.db"));
  const insert = db.prepare("INSERT INTO events(id, ts, kind, plan, task, json) VALUES(?, ?, ?, ?, ?, ?)");
  const event = (
    id: string,
    ts: string,
    kind: string,
    plan: string | null,
    task: string | null,
    data: Record<string, unknown>,
  ) => JSON.stringify({ v: 1, ts, source: "ginga", kind, id, plan, task, data });

  insert.run("01JC00000000000000000000A1", "2026-11-03T10:00:00.000Z", "attempt", "PLAN-0001", "T1", event("01JC00000000000000000000A1", "2026-11-03T10:00:00.000Z", "attempt", "PLAN-0001", "T1", { runtime: "opencode", model: "glm-free", tier: "free", attempt_n: 1, passed: false, failure: "done_when" }));
  insert.run("01JC00000000000000000000A2", "2026-11-03T10:02:00.000Z", "attempt", "PLAN-0001", "T1", event("01JC00000000000000000000A2", "2026-11-03T10:02:00.000Z", "attempt", "PLAN-0001", "T1", { runtime: "opencode", model: "glm-free", tier: "free", attempt_n: 2, passed: true }));
  insert.run("01JC00000000000000000000A3", "2026-11-03T10:03:00.000Z", "attempt", "PLAN-0001", "T2", event("01JC00000000000000000000A3", "2026-11-03T10:03:00.000Z", "attempt", "PLAN-0001", "T2", { runtime: "opencode", model: "glm-free", tier: "free", attempt_n: 1, passed: true }));
  insert.run("01JC00000000000000000000C1", "2026-11-03T10:01:00.000Z", "cost", "PLAN-0001", "T1", event("01JC00000000000000000000C1", "2026-11-03T10:01:00.000Z", "cost", "PLAN-0001", "T1", { amount_usd: 2, model: "opencode/glm-free" }));
  insert.run("01JC00000000000000000000C2", "2026-11-03T10:03:00.000Z", "cost", "PLAN-0001", "T2", event("01JC00000000000000000000C2", "2026-11-03T10:03:00.000Z", "cost", "PLAN-0001", "T2", { amount_usd: 1, model: "opencode/glm-free" }));
  insert.run("01JC00000000000000000000L1", "2026-11-03T10:00:30.000Z", "alert", "PLAN-0001", "T1", event("01JC00000000000000000000L1", "2026-11-03T10:00:30.000Z", "alert", "PLAN-0001", "T1", { rule_id: "no_progress", severity: "warn", entity: "PLAN-0001/T1", summary: "sem progresso" }));
  insert.run("01JC00000000000000000000R1", "2026-11-03T10:10:00.000Z", "receipt", "PLAN-0001", "T1", event("01JC00000000000000000000R1", "2026-11-03T10:10:00.000Z", "receipt", "PLAN-0001", "T1", { status: "pass" }));
  return { db, root };
}

describe("PLAN-0014 TASK-12 — payload do dashboard", () => {
  test("métricas calculam execuções, taxa de falha e custo por SPEC/PLAN/TASK", async () => {
    const mod = await import("../src/metrics").catch(() => null);
    expect(mod).not.toBeNull();
    const { db, root } = fixture();
    const metrics = (mod as unknown as { computeMetrics: (db: Database, options: { root: string }) => DashboardMetrics }).computeMetrics(db, { root });
    db.close();

    expect(metrics.executions).toBe(3);
    expect(metrics.failure_rate).toBeCloseTo(1 / 3, 10);
    expect(metrics.cost_by).toEqual({
      spec: { "SPEC-0001": 3 },
      plan: { "PLAN-0001": 3 },
      task: { "PLAN-0001/T1": 2, "PLAN-0001/T2": 1 },
    });
  });

  test("o verbo metrics inclui repeated_errors e as métricas do vigia", async () => {
    const mod = await import("../src/verbs/read").catch(() => null);
    expect(mod).not.toBeNull();
    const { db, root } = fixture();
    const payload = (mod as unknown as {
      metrics: (ctx: { by: string; via: string; root: string; db: Database }, args: Record<string, string | undefined>) => DashboardMetrics & { alert_metrics: Array<Record<string, unknown>> };
    }).metrics({ by: "test", via: "test", root, db }, {});
    db.close();

    expect(payload.repeated_errors).toBe(0);
    expect(payload.alert_metrics).toEqual([
      { rule_id: "no_progress", count: 1, open: 0, mttr_min: 9.5, cost_usd: 2 },
    ]);
  });
});
