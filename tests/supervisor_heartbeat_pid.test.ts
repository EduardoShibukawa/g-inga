import { describe, expect, test } from "bun:test";

describe("supervisor: heartbeat periódico leva o pid do filho", () => {
  test("heartbeat durante o filho → pid = pid do filho, nunca process.pid", async () => {
    const { Supervisor } = await import("../src/supervisor.ts");
    const emitted: { e: any; childRunning: boolean }[] = [];
    let childRunning = false;
    let started = 0;
    const sup = new Supervisor([{ repo: "r", command: "sleep" }], {
      pendingCheck: async () => started === 0,
      progressCheck: async () => 3,
      heartbeatMs: 20,
      sleep: async () => {},
      spawn: () => ({
        pid: 424242,
        on: (ev: string, cb: any) => {
          if (ev !== "exit") return;
          started++;
          childRunning = true;
          setTimeout(() => { childRunning = false; cb(0); }, 150);
        },
      }),
      emit: (e: any) => { emitted.push({ e, childRunning }); },
    });
    await sup.run();
    const during = emitted.filter((x) => x.e.kind === "heartbeat" && x.childRunning);
    expect(during.length).toBeGreaterThanOrEqual(2);
    for (const x of during) {
      expect(x.e.data.pid).toBe(424242);
      expect(x.e.data.pid).not.toBe(process.pid);
    }
    const post = emitted.filter((x) => x.e.kind === "heartbeat" && !x.childRunning);
    for (const x of post) expect(x.e.data.pid).not.toBe(process.pid);
  });
});
