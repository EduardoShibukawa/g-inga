import { describe, expect, test } from "bun:test";
import { evaluateWatch } from "../src/watch/evaluate.ts";

const ulid = "01JABCDEFGHJKMNPQRSTVWXYZ1";
const hb = (ts: string, entity: string, extra: any = {}) =>
  ({ v:1, ts, source:"vigia", kind:"heartbeat", id:ulid, data:{ entity, pid:1, progress:1, ...extra } });
const moved = (events: any[]) =>
  evaluateWatch(events).filter((a:any) => a.rule_id === "main_moved_outside_gate");

describe("main_moved: SHA comparado por entidade/lane", () => {
  test("2 lanes com SHAs diferentes e estáveis → nenhum alerta", () => {
    expect(moved([
      hb("2026-10-28T18:00:00.000Z", "lane:ginga", { main_sha: "aaa" }),
      hb("2026-10-28T18:00:10.000Z", "lane:manda", { main_sha: "bbb" }),
      hb("2026-10-28T18:05:00.000Z", "lane:ginga", { main_sha: "aaa" }),
      hb("2026-10-28T18:05:10.000Z", "lane:manda", { main_sha: "bbb" }),
    ])).toEqual([]);
  });
  test("só a lane cujo SHA mudou alerta (crítico, na entidade dela)", () => {
    const a = moved([
      hb("2026-10-28T18:00:00.000Z", "lane:ginga", { main_sha: "aaa" }),
      hb("2026-10-28T18:00:10.000Z", "lane:manda", { main_sha: "ccc" }),
      hb("2026-10-28T18:05:00.000Z", "lane:ginga", { main_sha: "bbb" }),
      hb("2026-10-28T18:05:10.000Z", "lane:manda", { main_sha: "ccc" }),
    ]);
    expect(a.length).toBe(1);
    expect(a[0].severity).toBe("critical");
    expect(a[0].entity).toBe("lane:ginga");
  });
  test("lane com SHA estável + lane sem SHA → warn só para a sem SHA", () => {
    const a = moved([
      hb("2026-10-28T18:00:00.000Z", "lane:ginga", { main_sha: "aaa" }),
      hb("2026-10-28T18:05:00.000Z", "lane:ginga", { main_sha: "aaa" }),
      hb("2026-10-28T18:00:30.000Z", "lane:manda"),
    ]);
    expect(a.length).toBe(1);
    expect(a[0].severity).toBe("warn");
    expect(a[0].entity).toBe("lane:manda");
  });
});
