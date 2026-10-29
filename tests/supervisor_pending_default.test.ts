import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Supervisor } from "../src/supervisor.ts";

function mkroot() {
  const dir = realpathSync(mkdtempSync(join(realpathSync(tmpdir()), "suppend-")));
  mkdirSync(join(dir, ".ginga", "prompts"), { recursive: true });
  mkdirSync(join(dir, ".ginga", "plans", "PLAN-0001-x", "ready"), { recursive: true });
  return dir;
}

function fakeChild(code: number, onSpawn?: () => void) {
  onSpawn?.();
  return {
    pid: 4245,
    on: (ev: string, cb: any) => {
      if (ev === "exit") setTimeout(() => cb(code), 0);
    },
  };
}

describe("supervisor: pendência padrão = backlog + ready (+ fila, se configurada)", () => {
  test("tudo vazio: no_pending, nenhum spawn", async () => {
    const dir = mkroot();
    writeFileSync(join(dir, ".ginga", "prompts", "backlog-r.md"), "- [x] feito\n");
    let spawns = 0;
    const sup = new Supervisor([{ repo: "r", command: "true" }], {
      root: dir,
      sleep: async () => {},
      spawn: () => fakeChild(0, () => spawns++),
      emit: () => {},
    });
    const res = await sup.run();
    rmSync(dir, { recursive: true, force: true });
    expect(spawns).toBe(0);
    expect(res[0]!.stoppedReason).toBe("no_pending");
  });

  test("backlog com `- [ ]` e fila vazia: pendente (roda até o backlog esvaziar)", async () => {
    const dir = mkroot();
    const bl = join(dir, ".ginga", "prompts", "backlog-r.md");
    writeFileSync(bl, "- [ ] fazer\n");
    let spawns = 0;
    const sup = new Supervisor([{ repo: "r", command: "true" }], {
      root: dir,
      queueCommand: `echo '{"tasks":[]}'`,
      sleep: async () => {},
      spawn: () => fakeChild(0, () => { spawns++; writeFileSync(bl, "- [x] fazer\n"); }),
      emit: () => {},
    });
    const res = await sup.run();
    rmSync(dir, { recursive: true, force: true });
    expect(spawns).toBe(1);
    expect(res[0]!.stoppedReason).toBe("no_pending");
  });

  test("ready/<repo>.json sem backlog: pendente", async () => {
    const dir = mkroot();
    const rd = join(dir, ".ginga", "plans", "PLAN-0001-x", "ready", "r.json");
    writeFileSync(rd, "{}");
    let spawns = 0;
    const sup = new Supervisor([{ repo: "r", command: "true" }], {
      root: dir,
      sleep: async () => {},
      spawn: () => fakeChild(0, () => { spawns++; rmSync(rd); }),
      emit: () => {},
    });
    const res = await sup.run();
    rmSync(dir, { recursive: true, force: true });
    expect(spawns).toBe(1);
    expect(res[0]!.stoppedReason).toBe("no_pending");
  });
});
