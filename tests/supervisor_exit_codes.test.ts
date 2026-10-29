import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Supervisor } from "../src/supervisor.ts";

function fakeChild(code: number) {
  return {
    pid: 4243,
    on: (ev: string, cb: any) => {
      if (ev === "exit") setTimeout(() => cb(code), 0);
    },
  };
}

describe("supervisor: exit 20 e exit 4 não são falha comum", () => {
  test("exit 20 (main movida fora do gate): 1 spawn só, stoppedReason main_moved e alerta crítico", async () => {
    const emitted: any[] = [];
    let spawns = 0;
    const sup = new Supervisor([{ repo: "r", command: "true" }], {
      pendingCheck: async () => true,
      maxRestarts: 100,
      sleep: async () => {},
      spawn: () => {
        spawns++;
        return fakeChild(20);
      },
      emit: (e: any) => emitted.push(e),
    });
    const res = await sup.run();
    expect(spawns).toBe(1);
    expect(res[0]!.runs).toBe(1);
    expect(res[0]!.stoppedReason).toBe("main_moved");
    const alert = emitted.find((e) => e.kind === "alert");
    expect(alert).toBeTruthy();
    expect(alert.data.severity).toBe("critical");
    expect(alert.data.entity).toBe("lane:r");
  });

  test("exit 4 (cota free esgotada): pausa 60 min sem novo spawn e sem consumir restarts", async () => {
    const dir = realpathSync(mkdtempSync(join(realpathSync(tmpdir()), "sup4-")));
    mkdirSync(join(dir, ".ginga", "handoffs"), { recursive: true });
    writeFileSync(join(dir, ".ginga", "handoffs", ".free-esgotado"), "");
    const sleeps: number[] = [];
    let spawns = 0;
    const sup: Supervisor = new Supervisor([{ repo: "r", command: "true" }], {
      root: dir,
      pendingCheck: async () => true,
      maxRestarts: 0,
      sleep: async (ms: number) => {
        sleeps.push(ms);
        sup.stop();
      },
      spawn: () => {
        spawns++;
        return fakeChild(4);
      },
      emit: () => {},
    });
    const res = await sup.run();
    rmSync(dir, { recursive: true, force: true });
    expect(spawns).toBe(1);
    expect(sleeps[0]).toBeGreaterThanOrEqual(3_500_000);
    expect(sleeps[0]).toBeLessThanOrEqual(3_600_000);
    expect(res[0]!.stoppedReason).toBe("stopped");
  });
});
