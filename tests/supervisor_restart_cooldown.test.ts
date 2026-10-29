import { describe, expect, test } from "bun:test";
import { Supervisor, parseSupervisorConfig } from "../src/supervisor.ts";

function fakeChild(code: number) {
  return {
    pid: 4244,
    on: (ev: string, cb: any) => {
      if (ev === "exit") setTimeout(() => cb(code), 0);
    },
  };
}

describe("supervisor: estourar max_restarts com pendência espera restart_cooldown_ms e religa", () => {
  test("depois do cooldown a lane religa com restarts zerados e não encerra", async () => {
    const sleeps: number[] = [];
    let spawns = 0;
    const sup: Supervisor = new Supervisor([{ repo: "r", command: "true" }], {
      pendingCheck: async () => true,
      maxRestarts: 2,
      backoffBaseMs: 1,
      backoffMaxMs: 1,
      restartCooldownMs: 5000,
      sleep: async (ms: number) => {
        sleeps.push(ms);
      },
      spawn: () => {
        spawns++;
        if (spawns >= 5) sup.stop();
        return fakeChild(1);
      },
      emit: () => {},
    });
    const res = await sup.run();
    expect(sleeps).toContain(5000);
    expect(spawns).toBeGreaterThanOrEqual(5);
    expect(res[0]!.stoppedReason).toBe("stopped");
  });

  test("padrões: backoff 60 s a 10 min, restart_cooldown 30 min", async () => {
    const cfg = parseSupervisorConfig("");
    expect(cfg.backoffBaseMs).toBe(60_000);
    expect(cfg.backoffMaxMs).toBe(600_000);
    expect(cfg.restartCooldownMs).toBe(1_800_000);
    expect(parseSupervisorConfig("[supervisor]\nrestart_cooldown_ms = 777\n").restartCooldownMs).toBe(777);

    const sleeps: number[] = [];
    const sup: Supervisor = new Supervisor([{ repo: "r", command: "true" }], {
      pendingCheck: async () => true,
      sleep: async (ms: number) => {
        sleeps.push(ms);
        sup.stop();
      },
      spawn: () => fakeChild(1),
      emit: () => {},
    });
    await sup.run();
    expect(sleeps[0]).toBe(60_000);
  });
});
