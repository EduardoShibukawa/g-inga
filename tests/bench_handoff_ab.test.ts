import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validateEvent } from "../src/events/validate.ts";

const ROOT = join(import.meta.dir, "..");
const FIXTURE = join(ROOT, "tests/fixtures/handoff-ab.jsonl");
const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function benchPath(): string {
  const dir = mkdtempSync(join(tmpdir(), "ginga-handoff-ab-"));
  dirs.push(dir);
  return join(dir, "bench.db");
}

async function loadModules(): Promise<{ store: any; ab: any }> {
  let store: any = null;
  let ab: any = null;
  try {
    store = await import(join(ROOT, "src/bench/store.ts"));
  } catch {
    store = null;
  }
  try {
    ab = await import(join(ROOT, "src/bench/handoff_ab.ts"));
  } catch {
    ab = null;
  }
  return { store, ab };
}

describe("PLAN-0014 TASK-06 — A/B handoff no bench do ginga", () => {
  test("o fixture usa envelopes v1 válidos", () => {
    const events = readFileSync(FIXTURE, "utf8")
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => validateEvent(JSON.parse(line)));
    expect(events).toHaveLength(8);
    expect(events.every((result) => result.ok)).toBe(true);
  });

  test("registra experimento, braços, runs e eventos v1", async () => {
    const { store, ab } = await loadModules();
    expect(store).not.toBeNull();
    expect(ab).not.toBeNull();

    const bench = store.openBench(benchPath());
    const imported = ab.importHandoffAb(bench, FIXTURE);
    expect(imported).toEqual({ runs: 4, events: 8 });

    const tables = bench
      .query("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all()
      .map((row: any) => row.name);
    expect(tables).toEqual(expect.arrayContaining(["experiment", "arm", "run", "event"]));

    expect(bench.query("SELECT id, methodology_version FROM experiment").all()).toEqual([
      { id: "handoff-ab", methodology_version: 1 },
    ]);
    const arms = bench
      .query("SELECT id FROM arm WHERE experiment = 'handoff-ab' ORDER BY id")
      .all()
      .map((row: any) => row.id);
    expect(arms).toEqual(["ginga-handoff", "native-compact"]);

    const runs = bench
      .query("SELECT id, arm, task, started, ended FROM run ORDER BY id")
      .all() as any[];
    expect(runs).toHaveLength(4);
    expect(runs.map((row) => [row.id, row.arm, row.task])).toEqual([
      ["run-ginga-1", "ginga-handoff", "task-1"],
      ["run-ginga-2", "ginga-handoff", "task-2"],
      ["run-native-1", "native-compact", "task-1"],
      ["run-native-2", "native-compact", "task-2"],
    ]);
    expect(runs.every((row) => typeof row.started === "string" && typeof row.ended === "string")).toBe(true);

    const kinds = bench
      .query("SELECT kind, count(*) AS n FROM event GROUP BY kind ORDER BY kind")
      .all() as any[];
    expect(kinds).toEqual([
      { kind: "attempt", n: 6 },
      { kind: "handoff", n: 2 },
    ]);
    bench.close();
  });

  test("reporta FTPR, custo e tokens de handoff por braço", async () => {
    const { store, ab } = await loadModules();
    expect(store).not.toBeNull();
    expect(ab).not.toBeNull();

    const bench = store.openBench(benchPath());
    ab.importHandoffAb(bench, FIXTURE);
    const report = ab.handoffAbReport(bench) as any[];
    const native = report.find((row) => row.arm === "native-compact");
    const ginga = report.find((row) => row.arm === "ginga-handoff");

    expect(native).toMatchObject({ arm: "native-compact", runs: 2, handoff_tokens_avg: null });
    expect(native.ftpr).toBeCloseTo(0.5);
    expect(native.cost_usd).toBeCloseTo(0.6);
    expect(ginga).toMatchObject({ arm: "ginga-handoff", runs: 2 });
    expect(ginga.ftpr).toBeCloseTo(0.5);
    expect(ginga.cost_usd).toBeCloseTo(1.5);
    expect(ginga.handoff_tokens_avg).toBeCloseTo(200);
    bench.close();
  });

  test("reimportar o mesmo JSONL não duplica runs nem eventos", async () => {
    const { store, ab } = await loadModules();
    expect(store).not.toBeNull();
    expect(ab).not.toBeNull();

    const bench = store.openBench(benchPath());
    ab.importHandoffAb(bench, FIXTURE);
    ab.importHandoffAb(bench, FIXTURE);
    expect((bench.query("SELECT count(*) AS n FROM run").get() as any).n).toBe(4);
    expect((bench.query("SELECT count(*) AS n FROM event").get() as any).n).toBe(8);
    expect(ab.handoffAbReport(bench)).toHaveLength(2);
    bench.close();
  });
});
