import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { readFileSync } from "node:fs";
import { validateEvent } from "../src/events/validate.ts";

let watchModule: any = null;
try {
  watchModule = await import("../src/watch.ts");
} catch {
  watchModule = null;
}

function readFixture(name: string): any[] {
  const path = join(import.meta.dir, "fixtures", "watch", name);
  const raw = readFileSync(path, "utf8");
  return raw.trim().split("\n").filter((l) => l.trim() !== "").map((l) => JSON.parse(l));
}

const empty: any[] = [];

describe("kind alert no schema v1", () => {
  const ulid = "01JABCDEFGHJKMNPQRSTVWXYZ1";
  const env = (data: any) => ({ v: 1, ts: "2026-10-28T12:00:00.000Z", source: "test", kind: "alert", id: ulid, data });
  test("alert válido aceito", () => {
    expect(validateEvent(env({ rule_id: "no_progress", severity: "high", entity: "x", summary: "s" })).ok).toBe(true);
  });
  test("alert sem campos obrigatórios rejeitado", () => {
    expect(validateEvent(env({ rule_id: "x" })).ok).toBe(false);
  });
  test("severity é enum", () => {
    expect(validateEvent(env({ rule_id: "x", severity: "nope", entity: "e", summary: "s" })).ok).toBe(false);
  });
  test("campo desconhecido ignorado", () => {
    expect(validateEvent(env({ rule_id: "x", severity: "info", entity: "e", summary: "s", extra: 1, actions: ["a"] })).ok).toBe(true);
  });
});

describe("ginga watch: parse rules.toml", () => {
  test("parseia version e lista de regras", () => {
    if (!watchModule) { expect(watchModule).not.toBeNull(); return; }
    const raw = `version = 1\n\n[[rule]]\nid = "no_progress"\nseverity = "high"\naction = "kill_and_retry"\n`;
    const r = watchModule.parseRulesToml(raw);
    expect(r.version).toBe(1);
    expect(r.rules.length).toBe(1);
    expect(r.rules[0].id).toBe("no_progress");
    expect(r.rules[0].severity).toBe("high");
  });
});

describe("ginga watch: uma regra por incidente", () => {
  const cases = [
    ["no_progress", "no_progress.jsonl"],
    ["lane_dead", "lane_dead.jsonl"],
    ["main_moved_outside_gate", "main_moved_outside_gate.jsonl"],
    ["judge_shopping", "judge_shopping.jsonl"],
    ["report_mismatch", "report_mismatch.jsonl"],
    ["goal_reached", "goal_reached.jsonl"],
  ] as const;
  for (const [rule, fixture] of cases) {
    test(`${rule} dispara na fixture ${fixture}`, () => {
      if (!watchModule) { expect(watchModule).not.toBeNull(); return; }
      const alerts = watchModule.evaluateWatch(readFixture(fixture));
      expect(alerts.some((a: any) => a.rule_id === rule)).toBe(true);
    });
    test(`${rule} não dispara em janela vazia`, () => {
      if (!watchModule) { expect(watchModule).not.toBeNull(); return; }
      const alerts = watchModule.evaluateWatch(empty);
      expect(alerts.some((a: any) => a.rule_id === rule)).toBe(false);
    });
  }
});

describe("ginga watch: alert shape", () => {
  test("alert tem campos obrigatórios", () => {
    if (!watchModule) { expect(watchModule).not.toBeNull(); return; }
    const alerts = watchModule.evaluateWatch(readFixture("no_progress.jsonl"));
    const a = alerts.find((x: any) => x.rule_id === "no_progress");
    expect(a).toBeDefined();
    expect(typeof a.severity).toBe("string");
    expect(typeof a.entity).toBe("string");
    expect(typeof a.summary).toBe("string");
    expect(Array.isArray(a.actions)).toBe(true);
    expect(typeof a.dedupe_key).toBe("string");
  });
});

describe("ginga watch: dedupe", () => {
  test("mesmo (rule_id,entity) não duplica", () => {
    if (!watchModule) { expect(watchModule).not.toBeNull(); return; }
    const events = readFixture("no_progress.jsonl");
    const alerts = watchModule.evaluateWatch([...events, ...events]);
    const count = alerts.filter((a: any) => a.rule_id === "no_progress").length;
    expect(count).toBe(1);
  });
});

describe("defaultRules", () => {
  test("defaultRules retorna 6 regras", () => {
    if (!watchModule) { expect(watchModule).not.toBeNull(); return; }
    expect(watchModule.defaultRules().length).toBe(6);
  });
});
