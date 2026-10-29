import { afterEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** PLAN-0028 TASK-01: fase do PLAN no state.db. */
const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

async function loadModule(): Promise<any> {
  const loaded: any = await import("../src/plan_phase.ts").catch((error: unknown) => ({ error }));
  expect(loaded.error).toBeUndefined();
  return loaded;
}

function events(path: string): any[] {
  return readFileSync(path, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

describe("plan_phase", () => {
  test("guarda a fase, conta replans e emite uma transition por mudança", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ginga-plan-phase-"));
    dirs.push(dir);
    const eventsPath = join(dir, "events.jsonl");
    const saved = process.env.GINGA_EVENTS;
    process.env.GINGA_EVENTS = eventsPath;

    const { getPhase, setPhase } = await loadModule();
    const db = new Database(":memory:");
    try {
      setPhase(db, "PLAN-0028", "approved", "inicio");
      expect(getPhase(db, "PLAN-0028")).toMatchObject({ phase: "approved", replans: 0 });
      expect(typeof getPhase(db, "PLAN-0028")?.since).toBe("string");

      setPhase(db, "PLAN-0028", "red", "RED pronto");
      setPhase(db, "PLAN-0028", "tasks", "TASKs materializadas");

      expect(getPhase(db, "PLAN-0028")).toMatchObject({ phase: "tasks", replans: 0 });
      expect(events(eventsPath).map((event) => ({
        from: event.data.from,
        to: event.data.to,
        reason: event.data.reason ?? event.reason,
      }))).toEqual([
        { from: "approved", to: "red", reason: "RED pronto" },
        { from: "red", to: "tasks", reason: "TASKs materializadas" },
      ]);

      setPhase(db, "PLAN-0028", "replan", "primeiro replan");
      setPhase(db, "PLAN-0028", "replan", "segundo replan");
      expect(getPhase(db, "PLAN-0028")).toMatchObject({ phase: "replan", replans: 2 });
    } finally {
      db.close();
      if (saved === undefined) delete process.env.GINGA_EVENTS;
      else process.env.GINGA_EVENTS = saved;
    }
  });
});
