import { afterEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Supervisor, parseSupervisorConfig } from "../src/supervisor.ts";

/**
 * PLAN-0028 TASK-20 (achado grave do judge 2026-11-01 na TASK-07):
 * o mode tick tem que estar ligado de ponta a ponta —
 * - `parseSupervisorConfig` lê `[supervisor] mode` (padrão `"tick"` na config, que o
 *   serve passa ao Supervisor; a classe sem `mode` mantém `"operador"`);
 * - o supervisor chama `childArgv` no spawn em mode tick (`ginga tick --loop --repo <repo>`);
 * - `ginga tick` aceita `--loop` e `--repo <r>` (antes saía 2) e filtra a fila por repo.
 */

setDefaultTimeout(20000);

const ROOT = join(import.meta.dir, "..");
const BIN = join(ROOT, "bin", "ginga.ts");

function fakeChild(code: number) {
  return {
    pid: 4242,
    on: (ev: string, cb: any) => {
      if (ev === "exit") setTimeout(() => cb(code), 0);
    },
  };
}

describe("TASK-20: parseSupervisorConfig lê [supervisor] mode (padrão tick na config)", () => {
  test("padrão tick; operador só quando escrito; valor estranho cai em tick", () => {
    expect(parseSupervisorConfig("").mode).toBe("tick");
    expect(parseSupervisorConfig('[supervisor]\nmode = "tick"\n').mode).toBe("tick");
    expect(parseSupervisorConfig('[supervisor]\nmode = "operador"\n').mode).toBe("operador");
    expect(parseSupervisorConfig('[supervisor]\nmode = "xyz"\n').mode).toBe("tick");
  });
});

describe("TASK-20: supervisor chama childArgv no spawn", () => {
  // contador de pendência POR supervisor (o bug da TASK-19 era compartilhar o contador)
  const mk = (cmds: string[], mode?: "tick" | "operador") => {
    let n = 0;
    let progress = 0;
    return new Supervisor([{ repo: "ginga", command: "manda lane ginga" }], {
      mode,
      pendingCheck: async () => n++ === 0,
      progressCheck: async () => ++progress,
      sleep: async () => {},
      spawn: (cmd: string) => {
        cmds.push(cmd);
        return fakeChild(0);
      },
      emit: () => {},
    });
  };

  test("mode tick spawna 'ginga tick --loop --repo <repo>'", async () => {
    const cmds: string[] = [];
    await mk(cmds, "tick").run();
    expect(cmds).toEqual(["ginga tick --loop --repo ginga"]);
  });

  test("mode operador e ausencia de mode no construtor usam lane.command", async () => {
    const cmds: string[] = [];
    await mk(cmds, "operador").run();
    await mk(cmds, undefined).run();
    expect(cmds).toEqual(["manda lane ginga", "manda lane ginga"]);
  });

  test("serve passa o mode da config: parseSupervisorConfig(\"\").mode leva o supervisor ao tick", async () => {
    const cmds: string[] = [];
    await mk(cmds, parseSupervisorConfig("").mode).run();
    expect(cmds).toEqual(["ginga tick --loop --repo ginga"]);
  });
});

describe("TASK-20: ginga tick aceita --loop/--repo", () => {
  const tmps: string[] = [];
  afterEach(() => {
    for (const d of tmps.splice(0)) rmSync(d, { recursive: true, force: true });
  });

  const entry = (task: string, state = "open") => ({ task, plan: task.split("/")[0], state, blocked_by: [] as string[] });

  function setup(queue: any[]) {
    const dir = realpathSync(mkdtempSync(join(realpathSync(tmpdir()), "ginga-tickwire-")));
    tmps.push(dir);
    mkdirSync(join(dir, ".ginga"), { recursive: true });
    writeFileSync(join(dir, "queue.json"), JSON.stringify({ tasks: queue }));
    const stub = join(dir, "dispatch-stub.sh");
    writeFileSync(stub, `#!/bin/sh\necho "$@" >> "${dir}/dispatch.log"\nexit 0\n`);
    chmodSync(stub, 0o755);
    writeFileSync(
      join(dir, ".ginga", "project.toml"),
      `[commands]\nqueue = "cat ${dir}/queue.json"\ndispatch = "${stub} run {plan} --task {task}"\n`,
    );
    const env: Record<string, string> = {
      ...process.env,
      HOME: dir,
      GINGA_STATE_DB: join(dir, "state.db"),
      GINGA_EVENTS: join(dir, "events.jsonl"),
      GINGA_TICK_LOOP_MS: "1",
      GINGA_TICK_LOOP_MAX: "10",
    };
    const tick = (args: string[] = []) => {
      const r = Bun.spawnSync(["bun", BIN, "tick", "--root", dir, ...args], { cwd: dir, env, stdout: "pipe", stderr: "pipe" });
      return { exit: r.exitCode, out: r.stdout.toString(), err: r.stderr.toString() };
    };
    const calls = () =>
      existsSync(join(dir, "dispatch.log")) ? readFileSync(join(dir, "dispatch.log"), "utf8").split("\n").filter(Boolean).sort() : [];
    return { dir, tick, calls };
  }

  test("--repo filtra a fila e sai 0 (não 2)", () => {
    const w = setup([entry("PLAN-0001/TASK-01"), entry("ginga/TASK-01")]);
    const r = w.tick(["--repo", "ginga", "--json"]);
    expect(r.exit).toBe(0);
    expect(w.calls()).toEqual(["run ginga --task TASK-01"]);
    expect(JSON.parse(r.out).dispatched).toEqual(["ginga/TASK-01"]);
  });

  test("--repo=<r> também vale", () => {
    const w = setup([entry("PLAN-0001/TASK-01"), entry("ginga/TASK-01")]);
    const r = w.tick(["--repo=ginga", "--json"]);
    expect(r.exit).toBe(0);
    expect(w.calls()).toEqual(["run ginga --task TASK-01"]);
  });

  test("--loop repete até não haver pendência claimável e sai 0", () => {
    const w = setup([entry("ginga/TASK-01")]);
    const r = w.tick(["--loop", "--repo", "ginga", "--json"]);
    expect(r.exit).toBe(0);
    // 1ª passada despacha; a 2ª não tem nada claimável (status dispatched) → sai
    expect(w.calls()).toEqual(["run ginga --task TASK-01"]);
  });

  test("flag desconhecida continua exit 2", () => {
    const w = setup([entry("ginga/TASK-01")]);
    const r = w.tick(["--bogus"]);
    expect(r.exit).toBe(2);
    expect(w.calls()).toEqual([]);
  });
});
