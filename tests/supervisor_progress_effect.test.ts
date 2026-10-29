import { afterEach, describe, expect, test } from "bun:test";
import { evaluateWatch } from "../src/watch/evaluate.ts";

describe("supervisor progress efeito real", () => {
  test("lane viva sem efeito -> progress constante -> no_progress dispara", async () => {
    const { Supervisor } = await import("../src/supervisor.ts");
    const emitted: any[] = [];
    let runs = 0;
    const sup = new Supervisor([{ repo: "r", command: "true" }], {
      pendingCheck: async () => true,
      progressCheck: async () => 42,
      spawn: (_cmd: string, _o: any) => {
        const child: any = {
          on: (ev: string, cb: any) => { if (ev === "exit") setTimeout(() => cb(0), 0); },
        };
        return child;
      },
      sleep: async () => {},
      emit: (e: any) => { emitted.push(e); },
    });

    const p = sup.run();
    // wait for a couple heartbeats
    await new Promise((resolve) => setTimeout(resolve, 50));
    // stop
    sup.stop();
    await p;

    const hearts = emitted.filter((e) => e.kind === "heartbeat");
    expect(hearts.length).toBeGreaterThanOrEqual(1);
    for (const h of hearts) expect(h.data.progress).toBe(42);
    // none should equal iteration count if more than 1
    // evaluateWatch: constant progress -> no_progress
    const events = hearts.map((h, i) => ({
      v: 1,
      ts: new Date(Date.now() + i * 60 * 60 * 1000).toISOString(),
      source: "ginga",
      kind: "heartbeat",
      id: `h${i}`,
      data: h.data,
    }));
    // ensure window span >= 30 min by spacing already 1h
    const alerts = evaluateWatch(events, [
      { id: "no_progress", window_minutes: 30, threshold: 1, severity: "high", action: "kill_and_retry" },
    ]);
    expect(alerts.some((a) => a.rule_id === "no_progress")).toBe(true);
  });
});
