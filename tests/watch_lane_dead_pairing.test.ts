import { describe, expect, test } from "bun:test";
import { evaluateWatch } from "../src/watch/evaluate.ts";

const ulid = "01JABCDEFGHJKMNPQRSTVWXYZ1";
const round = (ts: string, lane: string, phase: "start" | "end") =>
  ({ v:1, ts, source:"lane", kind:"lane.round", id:ulid, data:{ lane, phase } });
const dead = (events: any[]) => evaluateWatch(events).filter((a:any) => a.rule_id === "lane_dead");

describe("lane_dead: end fecha só o start correspondente", () => {
  test("start, end, start sem end e sem heartbeat → lane_dead", () => {
    const a = dead([
      round("2026-10-28T18:00:00.000Z", "L1", "start"),
      round("2026-10-28T18:05:00.000Z", "L1", "end"),
      round("2026-10-28T18:10:00.000Z", "L1", "start"),
    ]);
    expect(a.length).toBe(1);
    expect(a[0].entity).toBe("L1");
  });
  test("start, start, end → ainda há um start aberto → lane_dead", () => {
    expect(dead([
      round("2026-10-28T18:00:00.000Z", "L1", "start"),
      round("2026-10-28T18:02:00.000Z", "L1", "start"),
      round("2026-10-28T18:05:00.000Z", "L1", "end"),
    ]).length).toBe(1);
  });
  test("start, end → pareado → sem lane_dead", () => {
    expect(dead([
      round("2026-10-28T18:00:00.000Z", "L1", "start"),
      round("2026-10-28T18:05:00.000Z", "L1", "end"),
    ]).length).toBe(0);
  });
  test("o end de outra lane não fecha o start da lane aberta", () => {
    const a = dead([
      round("2026-10-28T18:00:00.000Z", "A", "start"),
      round("2026-10-28T18:01:00.000Z", "B", "start"),
      round("2026-10-28T18:05:00.000Z", "A", "end"),
    ]);
    expect(a.map((x:any) => x.entity)).toEqual(["B"]);
  });
  test("eventos fora de ordem no arquivo são pareados pela ordem temporal", () => {
    expect(dead([
      round("2026-10-28T18:05:00.000Z", "L1", "end"),
      round("2026-10-28T18:00:00.000Z", "L1", "start"),
    ]).length).toBe(0);
  });
});
