import { afterEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runTick } from "../src/tick";

/** PLAN-0028 TASK-04: nextAction puro e tick por fase do PLAN. */
const dirs: string[] = [];
const savedStateDb = process.env.GINGA_STATE_DB;
const savedEvents = process.env.GINGA_EVENTS;

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  if (savedStateDb === undefined) delete process.env.GINGA_STATE_DB;
  else process.env.GINGA_STATE_DB = savedStateDb;
  if (savedEvents === undefined) delete process.env.GINGA_EVENTS;
  else process.env.GINGA_EVENTS = savedEvents;
});

type TaskState = {
  id: string;
  status: "open" | "pass" | "fail" | "blocked";
  attempts: number;
  deps_done: boolean;
};

const task = (
  id: string,
  status: TaskState["status"],
  attempts = 0,
  deps_done = true,
): TaskState => ({ id, status, attempts, deps_done });

describe("nextAction", () => {
  test("escolhe a ação exata nos oito estados do ciclo", async () => {
    const loaded: any = await import("../src/tick_plan.ts").catch((error: unknown) => ({ error }));
    expect(loaded.error).toBeUndefined();
    const nextAction = loaded.nextAction as (state: any) => any;

    const cases: Array<{ input: any; cmd: string; task?: string }> = [
      {
        input: { phase: "approved", tasks: [task("PLAN-TICK/TASK-01", "open")], cap_ok: true },
        cmd: "red",
      },
      {
        input: { phase: "tasks", tasks: [task("PLAN-TICK/TASK-01", "open")], cap_ok: true },
        cmd: "run",
        task: "TASK-01",
      },
      {
        input: {
          phase: "tasks",
          tasks: [task("PLAN-TICK/TASK-01", "pass"), task("PLAN-TICK/TASK-02", "pass")],
          cap_ok: true,
        },
        cmd: "judge",
      },
      {
        input: {
          phase: "judge",
          tasks: [task("PLAN-TICK/TASK-01", "pass")],
          judge: "pass",
          cap_ok: true,
        },
        cmd: "merge",
      },
      {
        input: {
          phase: "judge",
          tasks: [task("PLAN-TICK/TASK-01", "pass")],
          judge: "high",
          cap_ok: true,
        },
        cmd: "replan",
      },
      {
        input: {
          phase: "tasks",
          tasks: [task("PLAN-TICK/TASK-01", "pass"), task("PLAN-TICK/TASK-02", "fail", 3)],
          cap_ok: true,
        },
        cmd: "replan",
        task: "TASK-02",
      },
      {
        input: { phase: "tasks", tasks: [task("PLAN-TICK/TASK-01", "open")], cap_ok: false },
        cmd: "notify",
      },
      {
        input: {
          phase: "done",
          tasks: [task("PLAN-TICK/TASK-01", "pass")],
          cap_ok: true,
        },
        cmd: "none",
      },
    ];

    expect(cases).toHaveLength(8);
    for (const testCase of cases) {
      const action = nextAction(testCase.input);
      expect(action).toMatchObject({
        cmd: testCase.cmd,
        plan: "PLAN-TICK",
        ...(testCase.task ? { task: testCase.task } : {}),
      });
      expect(typeof action.reason).toBe("string");
      expect(action.reason.length).toBeGreaterThan(0);
    }
  });
});

describe("tick por fase", () => {
  test("aplica a ação configurada, registra os argv e atualiza a fase", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ginga-tick-plan-"));
    dirs.push(dir);
    mkdirSync(join(dir, ".ginga", "state"), { recursive: true });

    const queuePath = join(dir, "queue.json");
    writeFileSync(
      queuePath,
      JSON.stringify({
        tasks: [
          { task: "PLAN-TICK/TASK-01", plan: "PLAN-TICK", state: "open", blocked_by: [] },
        ],
      }),
    );

    const logPath = join(dir, "commands.log");
    const stub = join(dir, "command.sh");
    writeFileSync(stub, `#!/bin/sh\nprintf '%s\\n' "$*" >> "${logPath}"\n`);

    const commands = [
      "[commands]",
      `queue = "cat ${queuePath}"`,
      `dispatch = "sh ${stub} dispatch {plan} {task}"`,
      `red = "sh ${stub} red {plan}"`,
      `run = "sh ${stub} run {plan} {task}"`,
      `judge = "sh ${stub} judge {plan}"`,
      `merge = "sh ${stub} merge {plan}"`,
      `replan = "sh ${stub} replan {plan} {task}"`,
      "",
    ].join("\n");
    writeFileSync(join(dir, ".ginga", "project.toml"), commands);

    const dbPath = join(dir, ".ginga", "state", "state.db");
    const db = new Database(dbPath);
    db.run(`CREATE TABLE plan_phase (
      plan PRIMARY KEY,
      phase TEXT,
      since TEXT,
      replans INTEGER NOT NULL DEFAULT 0
    )`);
    db.query("INSERT INTO plan_phase(plan, phase, since, replans) VALUES(?, ?, ?, 0)").run(
      "PLAN-TICK",
      "tasks",
      "2000-01-01T00:00:00.000Z",
    );
    db.close();

    process.env.GINGA_STATE_DB = dbPath;
    process.env.GINGA_EVENTS = join(dir, "events.jsonl");

    expect(await runTick(["--root", dir, "--json"])).toBe(0);
    expect(existsSync(logPath) ? readFileSync(logPath, "utf8").trim().split("\n") : []).toEqual([
      "run PLAN-TICK TASK-01",
    ]);

    const after = new Database(dbPath);
    const row = after
      .query("SELECT phase, since FROM plan_phase WHERE plan = ?")
      .get("PLAN-TICK") as { phase: string; since: string };
    after.close();
    expect(row.phase).toBe("tasks");
    expect(row.since).not.toBe("2000-01-01T00:00:00.000Z");
  });
});
