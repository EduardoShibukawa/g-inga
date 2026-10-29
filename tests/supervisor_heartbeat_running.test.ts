import { describe, expect, test } from "bun:test";
import { evaluateWatch } from "../src/watch/evaluate.ts";

describe("supervisor: heartbeat periódico enquanto o filho roda", () => {
  test("filho que dorme sem progresso → heartbeats durante a execução e no_progress", async () => {
    const { Supervisor } = await import("../src/supervisor.ts");
    const emitted: { e: any; childRunning: boolean }[] = [];
    let childRunning = false;
    let started = 0;
    const sup = new Supervisor([{ repo: "r", command: "sleep" }], {
      pendingCheck: async () => started === 0,
      progressCheck: async () => 7,
      heartbeatMs: 20,
      sleep: async () => {},
      spawn: () => ({
        on: (ev: string, cb: any) => {
          if (ev !== "exit") return;
          started++;
          childRunning = true;
          setTimeout(() => { childRunning = false; cb(0); }, 200);
        },
      }),
      emit: (e: any) => { emitted.push({ e, childRunning }); },
    });
    await sup.run();

    const during = emitted.filter((x) => x.e.kind === "heartbeat" && x.childRunning);
    expect(during.length).toBeGreaterThanOrEqual(3);
    for (const x of during) {
      expect(x.e.data.entity).toBe("lane:r");
      expect(x.e.data.progress).toBe(7);
    }
    const events = during.map((x, i) => ({
      v: 1, ts: new Date(Date.UTC(2026, 9, 29, 0, 0, 0) + i * 20 * 60 * 1000).toISOString(),
      source: "ginga", kind: "heartbeat", id: `h${i}`, data: x.e.data,
    }));
    const alerts = evaluateWatch(events, [
      { id: "no_progress", window_minutes: 30, threshold: 1, severity: "high", action: "kill_and_retry" },
    ]);
    expect(alerts.some((a: any) => a.rule_id === "no_progress")).toBe(true);
  });
});
