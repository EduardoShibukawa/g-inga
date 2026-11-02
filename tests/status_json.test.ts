import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openStateDb } from "../src/state/db";

/**
 * RED — PLAN-0012 TASK-10 (T323), substitui o RED de T161 (superseded): aquele era
 * incompatível com o schema real do state.db (task_exec tem PRIMARY KEY (plan, task),
 * sem plan_id/cost_usd; a tabela `events` guarda o envelope inteiro em `json`).
 * Contrato: PLAN.md "Interfaces" — buildStatus(root, db, now) e
 * listAlerts(db, { minSeverity, since }); root é a raiz do bundle (onde ficam
 * plans/, intents/, specs/), como nos demais verbos de leitura.
 */

const dirs: string[] = [];

beforeEach(() => {
  const dir = realpathSync(mkdtempSync(join(realpathSync(tmpdir()), "ginga-status-")));
  dirs.push(dir);
});

afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe("ginga status --json (PLAN-0012 TASK-10)", () => {
  test("buildStatus agrega owner, plans, alerts, broken_sources com relogio fixo", async () => {
    const root = dirs[0]!;
    mkdirSync(join(root, "plans", "PLAN-0099-x"), { recursive: true });
    writeFileSync(join(root, "plans", "PLAN-0099-x", "PLAN.md"), `---
type: plan
title: x
spec: SPEC-0001
intent: INTENT-0001
status: draft
---
`);

    const db = openStateDb(join(root, "state.db"));
    db.run("INSERT INTO task_exec(plan, task, status, attempts) VALUES ('PLAN-0099','T1','pass',1)");
    db.run("INSERT INTO task_exec(plan, task, status, attempts) VALUES ('PLAN-0099','T2','open',2)");
    db.run("INSERT INTO task_exec(plan, task, status, attempts) VALUES ('PLAN-0099','T3','open',0)");
    const ev = (id: string, ts: string, kind: string, plan: string | null, task: string | null, data: unknown) =>
      db.run(
        "INSERT INTO events(id, ts, kind, plan, task, json) VALUES (?,?,?,?,?,?)",
        id, ts, kind, plan, task,
        JSON.stringify({ v: 1, ts, source: "test", kind, id, plan, task, data }),
      );
    // attempts/custo vêm dos eventos `attempt` do PLAN (data.cost_usd)
    ev("01JBX00000000000000000A0A", "2026-10-29T09:00:00Z", "attempt", "PLAN-0099", "T1", { runtime: "pi", passed: true, model: "m1", cost_usd: 0 });
    ev("01JBX00000000000000000A0B", "2026-10-29T10:00:00Z", "attempt", "PLAN-0099", "T2", { runtime: "pi", passed: false, model: "m2", attempt_n: 2, cost_usd: 0.02 });
    ev("01JBX00000000000000000A0C", "2026-10-29T11:00:00Z", "attempt", "PLAN-0099", "T3", { runtime: "pi", passed: false, model: "m3", attempt_n: 1, cost_usd: 0.01 });
    // alertas: 2 dentro da janela de 24 h, 1 antiga (fora da janela)
    ev("01JBX00000000000000000B01", "2026-10-29T10:00:00Z", "alert", "PLAN-0099", null, { rule_id: "r1", severity: "critical", entity: "PLAN-0099", summary: "x" });
    ev("01JBX00000000000000000B02", "2026-10-29T11:00:00Z", "alert", null, "T2", { rule_id: "r2", severity: "warn", entity: "T2", summary: "y" });
    ev("01JBX00000000000000000B03", "2026-10-27T10:00:00Z", "alert", null, null, { rule_id: "r3", severity: "info", entity: "x", summary: "old" });
    db.close();

    const prev = process.env.GINGA_EVENTS;
    process.env.GINGA_EVENTS = join(root, "nope.jsonl"); // fonte quebrada: arquivo inexistente
    const { buildStatus } = await import("../src/status");
    const { listAlerts } = await import("../src/alerts");
    const now = () => new Date("2026-10-29T12:00:00Z");
    const db2 = openStateDb(join(root, "state.db"));
    const s = buildStatus(root, db2, now);
    const alerts = listAlerts(db2, { since: "2026-10-28T12:00:00Z" });
    db2.close();
    if (prev === undefined) delete process.env.GINGA_EVENTS; else process.env.GINGA_EVENTS = prev;

    expect(s.schema_version).toBe(1);
    expect(Array.isArray(s.owner)).toBe(true);
    expect(s.owner.length).toBeGreaterThanOrEqual(1); // PLAN draft → "aprovar"
    expect(s.plans.length).toBe(1);
    expect(s.plans[0]!.id).toBe("PLAN-0099");
    expect(s.plans[0]!.tasks.total).toBe(3);
    expect(s.plans[0]!.tasks.pass).toBe(1);
    expect(s.plans[0]!.tasks.open).toBe(2);
    expect(s.plans[0]!.attempts).toBe(3);
    expect(s.plans[0]!.cost_usd).toBeCloseTo(0.03);
    expect(s.alerts.critical).toBe(1);
    expect(s.alerts.warn).toBe(1);
    expect(s.alerts.info).toBe(0); // a alerta antiga (2026-10-27) não conta
    expect(s.broken_sources.length).toBe(1); // $GINGA_EVENTS inexistente, sem abortar
    // listAlerts: ordenados por ts desc, respeitam a janela `since`
    expect(alerts.length).toBe(2);
    expect(alerts[0]!.ts >= alerts[1]!.ts).toBe(true);
  });
});
