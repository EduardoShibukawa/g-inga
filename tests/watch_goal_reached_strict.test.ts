import { describe, expect, test } from "bun:test";
import { evaluateWatch } from "../src/watch/evaluate.ts";
import { validateEvent } from "../src/events/validate.ts";

const ulid = "01JABCDEFGHJKMNPQRSTVWXYZ1";
const env = (kind: string, data: any) => ({ v: 1, ts: "2026-10-28T12:00:00.000Z", source: "test", kind, id: ulid, data });

describe("goal_reached estrito", () => {
  test("dispara quando todos os gates passam, todos alvo.check ok e sem pendência", () => {
    const events = [
      { v:1, ts:"2026-10-28T21:00:00.000Z", source:"gate", kind:"gate.result", id:ulid, data:{plan:"P1",repo:"ginga",code:0} },
      { v:1, ts:"2026-10-28T21:01:00.000Z", source:"gate", kind:"alvo.check", id:ulid, data:{check:"c1",ok:true} },
      { v:1, ts:"2026-10-28T21:02:00.000Z", source:"gate", kind:"alvo.check", id:ulid, data:{check:"c2",ok:true} },
    ];
    const alerts = evaluateWatch(events);
    expect(alerts.some((a:any)=>a.rule_id==="goal_reached")).toBe(true);
  });
  test("não dispara se algum alvo.check false", () => {
    const events = [
      { v:1, ts:"2026-10-28T21:00:00.000Z", source:"gate", kind:"gate.result", id:ulid, data:{plan:"P1",repo:"ginga",code:0} },
      { v:1, ts:"2026-10-28T21:01:00.000Z", source:"gate", kind:"alvo.check", id:ulid, data:{check:"c1",ok:true} },
      { v:1, ts:"2026-10-28T21:02:00.000Z", source:"gate", kind:"alvo.check", id:ulid, data:{check:"c2",ok:false} },
    ];
    const alerts = evaluateWatch(events);
    expect(alerts.some((a:any)=>a.rule_id==="goal_reached")).toBe(false);
  });
  test("não dispara com pendência (lane.round start sem end)", () => {
    const events = [
      { v:1, ts:"2026-10-28T21:00:00.000Z", source:"gate", kind:"gate.result", id:ulid, data:{plan:"P1",repo:"ginga",code:0} },
      { v:1, ts:"2026-10-28T21:01:00.000Z", source:"gate", kind:"alvo.check", id:ulid, data:{check:"c1",ok:true} },
      { v:1, ts:"2026-10-28T21:02:00.000Z", source:"lane", kind:"lane.round", id:ulid, data:{lane:"L1",phase:"start"} },
    ];
    const alerts = evaluateWatch(events);
    expect(alerts.some((a:any)=>a.rule_id==="goal_reached")).toBe(false);
  });
});

describe("alert data.actions validação", () => {
  test("actions não-lista rejeitado", () => {
    const e = env("alert", { rule_id:"r", severity:"info", entity:"e", summary:"s", actions:"nope" });
    expect(validateEvent(e).ok).toBe(false);
  });
  test("actions lista de strings aceito", () => {
    const e = env("alert", { rule_id:"r", severity:"info", entity:"e", summary:"s", actions:["a","b"] });
    expect(validateEvent(e).ok).toBe(true);
  });
});
