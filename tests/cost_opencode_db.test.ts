import { afterEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");
const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function fixtureDb(): string {
  const dir = mkdtempSync(join(tmpdir(), "ginga-opencode-cost-"));
  dirs.push(dir);
  const path = join(dir, "opencode.db");
  const db = new Database(path);
  db.exec(readFileSync(join(ROOT, "tests/fixtures/opencode-db.sql"), "utf8"));
  db.close();
  return path;
}

async function loadCostModule(): Promise<any> {
  try {
    return await import(join(ROOT, "src/cost/opencode_db.ts"));
  } catch {
    return null;
  }
}

describe("PLAN-0014 TASK-07 — custo real no opencode.db", () => {
  test("lê sessões, custo, tokens, modelo e aplica since/ids", async () => {
    const mod = await loadCostModule();
    expect(mod).not.toBeNull();
    const path = fixtureDb();
    const all = mod.readOpencodeSessions(path);
    expect(all).toHaveLength(3);
    expect(all.find((s: any) => s.id === "ses-paid-1")).toMatchObject({
      model: "opencode/glm-5.3-flash",
      cost_usd: 0.25,
      tokens_in: 100,
      tokens_out: 20,
      directory: "/workspace/a",
    });
    expect(mod.readOpencodeSessions(path, { ids: ["ses-free"] }).map((s: any) => s.id)).toEqual(["ses-free"]);
    expect(mod.readOpencodeSessions(path, { since: "2023-11-14T22:15:00.000Z" }).map((s: any) => s.id)).toEqual(["ses-paid-2", "ses-free"]);
  });

  test("sincroniza três eventos cost e deduplica por session_id", async () => {
    const mod = await loadCostModule();
    expect(mod).not.toBeNull();
    const path = fixtureDb();
    const state = new Database(":memory:");
    state.run("CREATE TABLE events(id TEXT PRIMARY KEY, ts TEXT, kind TEXT, plan TEXT, task TEXT, json TEXT NOT NULL)");
    const first = mod.syncCost(state, mod.readOpencodeSessions(path));
    expect(first.emitted).toBe(3);
    const rows = state.query("SELECT kind, json FROM events ORDER BY rowid").all() as any[];
    expect(rows.map((r) => r.kind)).toEqual(["cost", "cost", "cost"]);
    const costs = rows.map((r) => JSON.parse(r.json));
    expect(costs.reduce((sum: number, e: any) => sum + e.data.amount_usd, 0)).toBe(1);
    expect(costs[0].data).toMatchObject({ scope: "call", cost_source: "reported", provider: "opencode", model: "opencode/glm-5.3-flash", tokens_in: 100, tokens_out: 20, session_id: "ses-paid-1" });
    expect(mod.syncCost(state, mod.readOpencodeSessions(path)).emitted).toBe(0);
    expect((state.query("SELECT count(*) AS n FROM events").get() as any).n).toBe(3);
    state.close();
  });

  test("schema sem cost falha com OpencodeSchemaError", async () => {
    const mod = await loadCostModule();
    expect(mod).not.toBeNull();
    const path = mkdtempSync(join(tmpdir(), "ginga-opencode-bad-"));
    dirs.push(path);
    const db = new Database(path);
    db.run("CREATE TABLE session_v2(id TEXT PRIMARY KEY)");
    db.close();
    expect(() => mod.readOpencodeSessions(path)).toThrow(mod.OpencodeSchemaError);
  });
});
