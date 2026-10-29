import { describe, expect, test } from "bun:test";
import { evaluateWatch } from "../src/watch/evaluate.ts";

const ulid = "01JABCDEFGHJKMNPQRSTVWXYZ1";
const hb = (ts: string, entity: string, progress: number, extra: any = {}) =>
  ({ v:1, ts, source:"vigia", kind:"heartbeat", id:ulid, data:{ entity, pid:1, progress, ...extra } });
const warns = (events: any[]) =>
  evaluateWatch(events).filter((a:any) => a.rule_id === "main_moved_outside_gate" && a.summary === "sem SHA de main no heartbeat");

describe("main_moved sem SHA: warn não depende de progress", () => {
  test("progress constante e sem SHA → warn", () => {
    const w = warns([
      hb("2026-10-28T18:00:00.000Z", "lane:ginga", 3),
      hb("2026-10-28T18:05:00.000Z", "lane:ginga", 3),
    ]);
    expect(w.length).toBe(1);
    expect(w[0].severity).toBe("warn");
  });
  test("um único heartbeat sem SHA → warn", () => {
    expect(warns([hb("2026-10-28T18:00:00.000Z", "lane:ginga", 3)]).length).toBe(1);
  });
  test("1 warn por lane (várias heartbeats da mesma lane → 1)", () => {
    const w = warns([
      hb("2026-10-28T18:00:00.000Z", "lane:ginga", 1),
      hb("2026-10-28T18:01:00.000Z", "lane:ginga", 2),
      hb("2026-10-28T18:02:00.000Z", "lane:ginga", 3),
      hb("2026-10-28T18:00:30.000Z", "lane:manda", 1),
    ]);
    expect(w.map((a:any) => a.entity).sort()).toEqual(["lane:ginga", "lane:manda"]);
  });
  test("heartbeat de executor não é lane → sem warn", () => {
    expect(warns([hb("2026-10-28T18:00:00.000Z", "executor/beam-free", 7)]).length).toBe(0);
  });
  test("com SHA em algum heartbeat → sem warn", () => {
    expect(warns([
      hb("2026-10-28T18:00:00.000Z", "lane:ginga", 1, { main_sha: "aaa" }),
      hb("2026-10-28T18:05:00.000Z", "lane:ginga", 2, { main_sha: "aaa" }),
    ]).length).toBe(0);
  });
});
