import { afterEach, expect, test } from "bun:test";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * PLAN-0010 TASK-02, idempotência entre processos: 2 `ginga tick` simultâneos contra a mesma fila e o mesmo state.db,
 * com um stub de `manda` que conta as chamadas (e dorme, para as janelas se sobreporem) → cada TASK é despachada 1 vez.
 */

const ROOT = join(import.meta.dir, "..");
const BIN = join(ROOT, "bin", "ginga.ts");
const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function workspace(n: number) {
  const dir = realpathSync(mkdtempSync(join(realpathSync(tmpdir()), "ginga-par-")));
  dirs.push(dir);
  mkdirSync(join(dir, ".ginga"), { recursive: true });
  const tasks = Array.from({ length: n }, (_, i) => ({ task: `PLAN-0001/TASK-0${i + 1}`, plan: "PLAN-0001", state: "open", blocked_by: [] }));
  writeFileSync(join(dir, "queue.json"), JSON.stringify({ tasks }));
  const stub = join(dir, "manda-stub.sh");
  writeFileSync(stub, `#!/bin/sh\necho "$@" >> "${dir}/calls.log"\nsleep 0.6\n`);
  chmodSync(stub, 0o755);
  writeFileSync(join(dir, ".ginga", "project.toml"), `[commands]\nqueue = "cat ${dir}/queue.json"\ndispatch = "${stub} run {plan} --task {task}"\n`);
  return dir;
}

async function ticks(dir: string, procs: number) {
  const env = { PATH: process.env.PATH ?? "", HOME: dir, GINGA_STATE_DB: join(dir, "state.db"), GINGA_EVENTS: join(dir, "events.jsonl") };
  const ps = Array.from({ length: procs }, () => Bun.spawn(["bun", BIN, "tick", "--root", dir], { cwd: dir, env, stdout: "pipe", stderr: "pipe" }));
  return Promise.all(ps.map((p) => p.exited));
}
const calls = (dir: string) => (existsSync(join(dir, "calls.log")) ? readFileSync(join(dir, "calls.log"), "utf8").split("\n").filter(Boolean).sort() : []);

test("2 ticks em paralelo, 4 TASKs: cada uma é despachada exatamente uma vez", async () => {
  const dir = workspace(4);
  const exits = await ticks(dir, 2);
  expect(exits).toEqual([0, 0]);
  expect(calls(dir)).toEqual([1, 2, 3, 4].map((i) => `run PLAN-0001 --task TASK-0${i}`));
});

test("3 ticks em paralelo, 1 TASK: despachada uma vez só", async () => {
  const dir = workspace(1);
  await ticks(dir, 3);
  expect(calls(dir)).toEqual(["run PLAN-0001 --task TASK-01"]);
});
