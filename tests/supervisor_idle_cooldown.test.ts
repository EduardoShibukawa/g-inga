import { describe, expect, test } from "bun:test";
import { Supervisor, parseSupervisorConfig } from "../src/supervisor.ts";

function fakeChild(code: number) {
  return {
    pid: 4242,
    on: (ev: string, cb: any) => {
      if (ev === "exit") setTimeout(() => cb(code), 0);
    },
  };
}

describe("supervisor: saída 0 sem progresso espera idle_cooldown_ms", () => {
  test("filho sai 0 duas vezes seguidas: o 2º spawn só vem depois do cooldown", async () => {
    const order: string[] = [];
    let spawns = 0;
    const sup: Supervisor = new Supervisor([{ repo: "r", command: "true" }], {
      pendingCheck: async () => true,
      idleCooldownMs: 600_000,
      sleep: async (ms: number) => {
        order.push(`sleep:${ms}`);
        if (spawns >= 2) sup.stop();
      },
      spawn: () => {
        spawns++;
        order.push("spawn");
        return fakeChild(0);
      },
      emit: () => {},
    });
    await sup.run();
    expect(order.slice(0, 3)).toEqual(["spawn", "sleep:600000", "spawn"]);
  });

  test("com progresso entre as rodadas não há cooldown de ociosidade", async () => {
    const sleeps: number[] = [];
    let spawns = 0;
    let counter = 0;
    const sup: Supervisor = new Supervisor([{ repo: "r", command: "true" }], {
      pendingCheck: async () => true,
      idleCooldownMs: 600_000,
      progressCheck: async () => ++counter,
      sleep: async (ms: number) => {
        sleeps.push(ms);
        if (spawns >= 3) sup.stop();
      },
      spawn: () => {
        spawns++;
        return fakeChild(0);
      },
      emit: () => {},
    });
    await sup.run();
    expect(spawns).toBeGreaterThanOrEqual(3);
    expect(sleeps.some((ms) => ms >= 600_000)).toBe(false);
  });

  test("config: idle_cooldown_ms (padrão 10 min)", () => {
    expect(parseSupervisorConfig("").idleCooldownMs).toBe(600_000);
    expect(parseSupervisorConfig("[supervisor]\nidle_cooldown_ms = 1234\n").idleCooldownMs).toBe(1234);
  });
});
