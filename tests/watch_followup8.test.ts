import { describe, expect, test } from "bun:test";
import { evaluateWatch } from "../src/watch/evaluate.ts";

const ulid = "01JABCDEFGHJKMNPQRSTVWXYZ1";

describe("follow-up 8: main_moved_outside_gate por SHA", () => {
  test("dispara quando SHA de main muda entre ticks e não há gate.result", () => {
    const events = [
      { v:1, ts:"2026-10-28T18:00:00.000Z", source:"vigia", kind:"heartbeat", id:ulid, data:{ entity:"repo/x", pid:1, progress:1, main_sha:"aaa" } },
      { v:1, ts:"2026-10-28T18:05:00.000Z", source:"vigia", kind:"heartbeat", id:ulid, data:{ entity:"repo/x", pid:1, progress:2, main_sha:"bbb" } },
    ];
    const alerts = evaluateWatch(events);
    expect(alerts.some((a:any)=>a.rule_id==="main_moved_outside_gate")).toBe(true);
  });
  test("não dispara quando SHA de main é constante", () => {
    const events = [
      { v:1, ts:"2026-10-28T18:00:00.000Z", source:"vigia", kind:"heartbeat", id:ulid, data:{ entity:"repo/x", pid:1, progress:1, main_sha:"aaa" } },
      { v:1, ts:"2026-10-28T18:05:00.000Z", source:"vigia", kind:"heartbeat", id:ulid, data:{ entity:"repo/x", pid:1, progress:2, main_sha:"aaa" } },
    ];
    const alerts = evaluateWatch(events);
    expect(alerts.some((a:any)=>a.rule_id==="main_moved_outside_gate")).toBe(false);
  });
  test("não dispara quando há gate.result na janela", () => {
    const events = [
      { v:1, ts:"2026-10-28T18:00:00.000Z", source:"vigia", kind:"heartbeat", id:ulid, data:{ entity:"repo/x", pid:1, progress:1, main_sha:"aaa" } },
      { v:1, ts:"2026-10-28T18:05:00.000Z", source:"vigia", kind:"heartbeat", id:ulid, data:{ entity:"repo/x", pid:1, progress:2, main_sha:"bbb" } },
      { v:1, ts:"2026-10-28T18:06:00.000Z", source:"gate", kind:"gate.result", id:ulid, data:{ plan:"P", repo:"x", code:0 } },
    ];
    const alerts = evaluateWatch(events);
    expect(alerts.some((a:any)=>a.rule_id==="main_moved_outside_gate")).toBe(false);
  });
});

describe("follow-up 8: no_progress aciona rotate_model", () => {
  test("actions contém kill_and_retry e rotate_model", () => {
    const events = [
      { v:1, ts:"2026-10-28T18:00:00.000Z", source:"vigia", kind:"heartbeat", id:ulid, data:{ entity:"lane/x", pid:1, progress:5, alive:true } },
      { v:1, ts:"2026-10-28T18:40:00.000Z", source:"vigia", kind:"heartbeat", id:ulid, data:{ entity:"lane/x", pid:1, progress:5, alive:true } },
    ];
    const alerts = evaluateWatch(events);
    const a = alerts.find((x:any)=>x.rule_id==="no_progress");
    expect(a).toBeDefined();
    expect(a.actions).toContain("kill_and_retry");
    expect(a.actions).toContain("rotate_model");
  });
});

describe("follow-up 8: goal_reached pareia start/end por ordem temporal", () => {
  test("start,end,start => pendência => não dispara", () => {
    const events = [
      { v:1, ts:"2026-10-28T21:00:00.000Z", source:"gate", kind:"gate.result", id:ulid, data:{ plan:"P1", repo:"ginga", code:0 } },
      { v:1, ts:"2026-10-28T21:01:00.000Z", source:"gate", kind:"alvo.check", id:ulid, data:{ check:"c1", ok:true } },
      { v:1, ts:"2026-10-28T20:59:00.000Z", source:"lane", kind:"lane.round", id:ulid, data:{ lane:"L1", phase:"start" } },
      { v:1, ts:"2026-10-28T21:02:00.000Z", source:"lane", kind:"lane.round", id:ulid, data:{ lane:"L1", phase:"end" } },
      { v:1, ts:"2026-10-28T21:03:00.000Z", source:"lane", kind:"lane.round", id:ulid, data:{ lane:"L1", phase:"start" } },
    ];
    const alerts = evaluateWatch(events);
    expect(alerts.some((a:any)=>a.rule_id==="goal_reached")).toBe(false);
  });
  test("start,end => sem pendência => dispara", () => {
    const events = [
      { v:1, ts:"2026-10-28T21:00:00.000Z", source:"gate", kind:"gate.result", id:ulid, data:{ plan:"P1", repo:"ginga", code:0 } },
      { v:1, ts:"2026-10-28T21:01:00.000Z", source:"gate", kind:"alvo.check", id:ulid, data:{ check:"c1", ok:true } },
      { v:1, ts:"2026-10-28T20:59:00.000Z", source:"lane", kind:"lane.round", id:ulid, data:{ lane:"L1", phase:"start" } },
      { v:1, ts:"2026-10-28T21:02:00.000Z", source:"lane", kind:"lane.round", id:ulid, data:{ lane:"L1", phase:"end" } },
    ];
    const alerts = evaluateWatch(events);
    expect(alerts.some((a:any)=>a.rule_id==="goal_reached")).toBe(true);
  });
});
