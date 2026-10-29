import { describe, expect, test } from "bun:test";
import { evaluateWatch } from "../src/watch/evaluate.ts";

const T0 = Date.UTC(2026, 9, 29, 0, 0, 0);
const hb = (min: number, progress: number) => ({
  v: 1, ts: new Date(T0 + min * 60 * 1000).toISOString(), source: "ginga", kind: "heartbeat",
  id: `h${min}`, data: { entity: "lane:r", pid: 1, progress, alive: true },
});
const rules = [{ id: "no_progress", window_minutes: 30, threshold: 1, severity: "high", action: "kill_and_retry" }];
const fired = (evs: any[]) => evaluateWatch(evs, rules).some((a: any) => a.rule_id === "no_progress");

describe("no_progress considera só a janela recente", () => {
  test("heartbeats antigos com progress diferente + recentes constantes → alerta", () => {
    expect(fired([hb(0, 1), hb(20, 2), hb(60, 5), hb(80, 5), hb(100, 5)])).toBe(true);
  });
  test("antigos constantes + recentes variando → sem alerta", () => {
    expect(fired([hb(0, 5), hb(20, 5), hb(40, 5), hb(75, 6), hb(100, 7)])).toBe(false);
  });
  test("tudo constante por >= janela continua alertando", () => {
    expect(fired([hb(0, 5), hb(40, 5)])).toBe(true);
  });
});
