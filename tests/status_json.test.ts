import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openStateDb } from "../src/state/db";

const dirs: string[] = [];

beforeEach(() => {
  const dir = realpathSync(mkdtempSync(join(realpathSync(tmpdir()), "ginga-status-")));
  dirs.push(dir);
});

afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe("ginga status --json (PLAN-0012 TASK-08)", () => {
  test("buildStatus agrega owner, plans, alerts, broken_sources com relogio fixo", async () => {
    const root = dirs[0]!;
    mkdirSync(join(root, ".ginga"), { recursive: true });
    mkdirSync(join(root, ".ginga", "plans"), { recursive: true });
    mkdirSync(join(root, "tasks"), { recursive: true });

    writeFileSync(join(root, ".ginga", "plans", "PLAN-0099-x.md"), `---
type: plan
title: x
spec: SPEC-0001
intent: INTENT-0001
status: draft
---
`);

    mkdirSync(join(root, "tasks", "T1"), { recursive: true });
    writeFileSync(join(root, "tasks", "T1", "PLAN.md"), `---
mode: padrao
goal: g
done_when: bun test
touch: []
---
`);

    mkdirSync(join(root, "tasks", "T2"), { recursive: true });
    writeFileSync(join(root, "tasks", "T2", "PLAN.md"), `---
mode: padrao
goal: g2
done_when: bun test
touch: []
---
`);
    mkdirSync(join(root, "tasks", "T3"), { recursive: true });
    writeFileSync(join(root, "tasks", "T3", "PLAN.md"), `---
mode: padrao
goal: g3
done_when: bun test
touch: []
---
`);

    const db = openStateDb(join(root, "state.db"));
    db.run("CREATE TABLE IF NOT EXISTS task_exec(task TEXT PRIMARY KEY, plan_id TEXT, status TEXT, attempts INTEGER DEFAULT 0, cost_usd REAL DEFAULT 0, updated_at TEXT)");
    db.run("INSERT INTO task_exec(task, plan_id, status, attempts, cost_usd) VALUES ('T1','PLAN-0099-x','pass',1,0)");
    db.run("INSERT INTO task_exec(task, plan_id, status, attempts, cost_usd) VALUES ('T2','PLAN-0099-x','open',2,0.02)");
    db.run("INSERT INTO task_exec(task, plan_id, status, attempts, cost_usd) VALUES ('T3','PLAN-0099-x','open',0,0.01)");
    db.run("CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT, kind TEXT, payload_json TEXT)");
    db.run("INSERT INTO events(ts, kind, payload_json) VALUES ('2026-10-29T10:00:00Z','alert','{\"rule_id\":\"r1\",\"severity\":\"critical\",\"entity\":\"PLAN-0099-x\",\"summary\":\"x\"}')");
    db.run("INSERT INTO events(ts, kind, payload_json) VALUES ('2026-10-29T11:00:00Z','alert','{\"rule_id\":\"r2\",\"severity\":\"warn\",\"entity\":\"T2\",\"summary\":\"y\"}')");
    db.close();

    const prev = process.env.GINGA_EVENTS;
    process.env.GINGA_EVENTS = join(root, "nope.jsonl");
    const { buildStatus } = await import("../src/status");
    const now = () => new Date("2026-10-29T12:00:00Z");
    const s = buildStatus(root, join(root, "state.db"), now);
    if (prev === undefined) delete process.env.GINGA_EVENTS; else process.env.GINGA_EVENTS = prev;

    expect(s.schema_version).toBe(1);
    expect(Array.isArray(s.owner)).toBe(true);
    expect(s.owner.length).toBeGreaterThanOrEqual(1);
    expect(s.plans.length).toBe(1);
    expect(s.plans[0]!.id).toBe("PLAN-0099-x");
    expect(s.plans[0]!.tasks.total).toBe(3);
    expect(s.plans[0]!.tasks.pass).toBe(1);
    expect(s.plans[0]!.tasks.open).toBe(2);
    expect(s.plans[0]!.attempts).toBe(3);
    expect(s.plans[0]!.cost_usd).toBeCloseTo(0.03);
    expect(s.alerts.critical).toBe(1);
    expect(s.alerts.warn).toBe(1);
    expect(s.broken_sources.length).toBe(1);
  });
});
