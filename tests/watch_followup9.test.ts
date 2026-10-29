import { describe, expect, test } from "bun:test";
import { evaluateWatch } from "../src/watch/evaluate.ts";

const ulid = "01JABCDEFGHJKMNPQRSTVWXYZ1";

describe("follow-up 9: main_moved sem SHA", () => {
  test("heartbeat sem SHA e progress mudando → nenhum CRÍTICO", () => {
    const events = [
      { v:1, ts:"2026-10-28T18:00:00.000Z", source:"vigia", kind:"heartbeat", id:ulid, data:{ entity:"repo/x", pid:1, progress:1 } },
      { v:1, ts:"2026-10-28T18:05:00.000Z", source:"vigia", kind:"heartbeat", id:ulid, data:{ entity:"repo/x", pid:1, progress:2 } },
    ];
    const alerts = evaluateWatch(events);
    expect(alerts.some((a:any)=>a.rule_id==="main_moved_outside_gate" && a.severity==="critical")).toBe(false);
  });

  test("emite warn 'sem SHA de main no heartbeat'", () => {
    const events = [
      { v:1, ts:"2026-10-28T18:00:00.000Z", source:"vigia", kind:"heartbeat", id:ulid, data:{ entity:"repo/x", pid:1, progress:1 } },
      { v:1, ts:"2026-10-28T18:05:00.000Z", source:"vigia", kind:"heartbeat", id:ulid, data:{ entity:"repo/x", pid:1, progress:2 } },
    ];
    const alerts = evaluateWatch(events);
    expect(alerts.some((a:any)=>a.summary==="sem SHA de main no heartbeat")).toBe(true);
    expect(alerts.some((a:any)=>a.severity==="warn")).toBe(true);
  });
});
