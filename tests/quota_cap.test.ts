import { afterEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { runTick } from "../src/tick";
import { quotaCapOk, type Quota } from "../src/quota/index";

/**
 * PLAN-0014 TASK-15: a decisão do PLAN diz que `ginga quota` alimenta o stub de
 * quota do `tick` (PLAN-0010). Hoje `src/tick.ts:593` passa `cap_ok: true` fixo.
 *
 * - `quotaCapOk` (puro, em src/quota/index.ts): falso só quando um provider
 *   automático (codex-rollout / claude-statusline / opencode-db) está esgotado
 *   (used_pct >= 100); manual/unavailable/stale nunca bloqueiam.
 * - e2e: PLAN por fase em `tasks` + HOME falso com a statusline do Claude
 *   esgotada (five_hour.used_percent = 100) → o tick NÃO despacha; com 10% → despacha.
 */

const dirs: string[] = [];
const savedHome = process.env.HOME;
const savedStateDb = process.env.GINGA_STATE_DB;
const savedEvents = process.env.GINGA_EVENTS;

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  if (savedHome === undefined) delete process.env.HOME;
  else process.env.HOME = savedHome;
  if (savedStateDb === undefined) delete process.env.GINGA_STATE_DB;
  else process.env.GINGA_STATE_DB = savedStateDb;
  if (savedEvents === undefined) delete process.env.GINGA_EVENTS;
  else process.env.GINGA_EVENTS = savedEvents;
});

const q = (used_pct: number | null, source: Quota["source"], provider = "claude-pro"): Quota => ({
  provider,
  window: "5 hours",
  used_pct,
  resets_at: null,
  source,
});

describe("quotaCapOk", () => {
  test("provider automático esgotado (>= 100%) bloqueia", () => {
    expect(quotaCapOk([q(100, "claude-statusline")])).toBe(false);
    expect(quotaCapOk([q(100, "codex-rollout")])).toBe(false);
    expect(quotaCapOk([q(150, "opencode-db", "zen")])).toBe(false);
  });

  test("abaixo de 100% não bloqueia", () => {
    expect(quotaCapOk([q(99.9, "claude-statusline")])).toBe(true);
    expect(quotaCapOk([q(0, "codex-rollout")])).toBe(true);
  });

  test("manual, unavailable e stale nunca bloqueiam; lista vazia não bloqueia", () => {
    expect(quotaCapOk([q(null, "manual", "gemini-pro")])).toBe(true);
    expect(quotaCapOk([q(null, "unavailable")])).toBe(true);
    expect(quotaCapOk([q(null, "stale")])).toBe(true);
    expect(quotaCapOk([])).toBe(true);
  });

  test("um esgotado entre vários bloqueia", () => {
    expect(quotaCapOk([q(10, "claude-statusline"), q(100, "codex-rollout"), q(null, "manual")])).toBe(false);
  });
});

describe("tick alimentado pela quota (stub do PLAN-0010)", () => {
  function setupPhasePlan(claudeUsedPercent: number) {
    const dir = mkdtempSync(join(tmpdir(), "ginga-tick-quota-"));
    dirs.push(dir);
    mkdirSync(join(dir, ".ginga", "state"), { recursive: true });
    // HOME falso com a statusline do Claude gravada
    mkdirSync(join(dir, ".local", "state", "ginga"), { recursive: true });
    writeFileSync(
      join(dir, ".local", "state", "ginga", "claude-rate-limits.json"),
      JSON.stringify({ rate_limits: { five_hour: { used_percent: claudeUsedPercent, resets_at: "2026-11-03T10:00:00.000Z" } } }),
    );

    const queuePath = join(dir, "queue.json");
    writeFileSync(
      queuePath,
      JSON.stringify({ tasks: [{ task: "PLAN-TICK/TASK-01", plan: "PLAN-TICK", state: "open", blocked_by: [] }] }),
    );
    const logPath = join(dir, "commands.log");
    const stub = join(dir, "command.sh");
    writeFileSync(stub, `#!/bin/sh\nprintf '%s\\n' "$*" >> "${logPath}"\n`);
    writeFileSync(
      join(dir, ".ginga", "project.toml"),
      [
        "[commands]",
        `queue = "cat ${queuePath}"`,
        `run = "sh ${stub} run {plan} {task}"`,
        "",
      ].join("\n"),
    );

    const dbPath = join(dir, ".ginga", "state", "state.db");
    const db = new Database(dbPath);
    db.run(`CREATE TABLE plan_phase (plan PRIMARY KEY, phase TEXT, since TEXT, replans INTEGER NOT NULL DEFAULT 0)`);
    db.query("INSERT INTO plan_phase(plan, phase, since, replans) VALUES(?, ?, ?, 0)").run("PLAN-TICK", "tasks", "2000-01-01T00:00:00.000Z");
    db.close();

    process.env.HOME = dir;
    process.env.GINGA_STATE_DB = dbPath;
    process.env.GINGA_EVENTS = join(dir, "events.jsonl");
    const runs = () => (existsSync(logPath) ? readFileSync(logPath, "utf8").split("\n").filter(Boolean) : []);
    return { dir, runs };
  }

  test("quota esgotada (used_pct 100) → o tick NÃO despacha a TASK", async () => {
    const w = setupPhasePlan(100);
    expect(await runTick(["--root", w.dir, "--json"])).toBe(0);
    expect(w.runs()).toEqual([]);
  });

  test("quota folgada (used_pct 10) → o tick despacha", async () => {
    const w = setupPhasePlan(10);
    expect(await runTick(["--root", w.dir, "--json"])).toBe(0);
    expect(w.runs()).toEqual(["run PLAN-TICK TASK-01"]);
  });
});
