import { describe, expect, test } from "bun:test";
import { evaluateWatch } from "../src/watch/evaluate.ts";

const ulid = "01JABCDEFGHJKMNPQRSTVWXYZ1";
const run = (code: any) => evaluateWatch([
  { v:1, ts:"2026-10-28T21:00:00.000Z", source:"gate", kind:"gate.result", id:ulid, data:{ plan:"P1", repo:"ginga", code } },
  { v:1, ts:"2026-10-28T21:01:00.000Z", source:"gate", kind:"alvo.check", id:ulid, data:{ check:"c1", ok:true } },
]).some((a:any) => a.rule_id === "goal_reached");

describe("goal_reached: code numérico", () => {
  test("code 0 numérico dispara", () => { expect(run(0)).toBe(true); });
  test("code string '0' não conta", () => { expect(run("0")).toBe(false); });
  test("code '' / null / false não contam", () => {
    expect(run("")).toBe(false);
    expect(run(null)).toBe(false);
    expect(run(false)).toBe(false);
  });
  test("code 1 não dispara", () => { expect(run(1)).toBe(false); });
});
