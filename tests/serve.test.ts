import { afterEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import { appendFileSync, chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * PLAN-0010 TASK-03: `ginga serve` + timers.
 * - `serve` roda a mesma função do `ginga tick` (TASK-02), por intervalo (`[serve].tick_seconds`) e por evento
 *   (`fs.watch` em `$GINGA_EVENTS`, com debounce), e escuta em `127.0.0.1:[serve].port` (responde qualquer HTTP).
 * - `--host` diferente de 127.0.0.1 → exit 2 (auth só no PLAN-0011).
 * - contrib/systemd: ginga-tick.service (ExecStart com `ginga tick`), ginga-tick.timer (`[Timer]`),
 *   ginga-serve.service (ExecStart com `ginga serve`), todos para `systemctl --user` (`WantedBy=default.target` nos que sobem sozinhos).
 *   docs/hermes-cron.md explica o cron do Hermes chamando `ginga tick`.
 */

setDefaultTimeout(20000);

const ROOT = join(import.meta.dir, "..");
const BIN = join(ROOT, "bin", "ginga.ts");
const dirs: string[] = [];
const procs: { kill: () => void }[] = [];
afterEach(() => {
  for (const p of procs.splice(0)) p.kill();
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

async function freePort(): Promise<number> {
  const s = Bun.serve({ port: 0, fetch: () => new Response("") });
  const port = s.port;
  s.stop(true);
  return port;
}

function setup(tickSeconds: number, port: number) {
  const dir = realpathSync(mkdtempSync(join(realpathSync(tmpdir()), "ginga-serve-")));
  dirs.push(dir);
  mkdirSync(join(dir, ".ginga"), { recursive: true });
  const queue = (tasks: string[]) => writeFileSync(join(dir, "queue.json"), JSON.stringify({ tasks: tasks.map((t) => ({ task: t, plan: t.split("/")[0], state: "open", blocked_by: [] })) }));
  queue([]);
  const stub = join(dir, "dispatch-stub.sh");
  writeFileSync(stub, `#!/bin/sh\necho "$@" >> "${dir}/dispatch.log"\n`);
  chmodSync(stub, 0o755);
  writeFileSync(
    join(dir, ".ginga", "project.toml"),
    `[commands]\nqueue = "cat ${dir}/queue.json"\ndispatch = "${stub} run {plan} --task {task}"\n[serve]\ntick_seconds = ${tickSeconds}\nport = ${port}\n`,
  );
  const events = join(dir, "events.jsonl");
  writeFileSync(events, "");
  const env = { PATH: process.env.PATH ?? "", HOME: dir, GINGA_STATE_DB: join(dir, "state.db"), GINGA_EVENTS: events };
  const serve = (extra: string[] = []) => {
    const p = Bun.spawn(["bun", BIN, "serve", "--root", dir, ...extra], { cwd: dir, env, stdout: "pipe", stderr: "pipe" });
    procs.push(p);
    return p;
  };
  const calls = () => (existsSync(join(dir, "dispatch.log")) ? readFileSync(join(dir, "dispatch.log"), "utf8").split("\n").filter(Boolean) : []);
  return { dir, events, queue, serve, calls };
}

async function until(cond: () => boolean | Promise<boolean>, ms: number): Promise<boolean> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await cond()) return true;
    await Bun.sleep(50);
  }
  return false;
}
const listening = (port: number) =>
  until(async () => {
    try {
      await fetch(`http://127.0.0.1:${port}/`);
      return true;
    } catch {
      return false;
    }
  }, 8000);

describe("ginga serve", () => {
  test("escuta em 127.0.0.1 e dispara o tick por timer (fila ganha uma TASK depois de subir)", async () => {
    const port = await freePort();
    const w = setup(1, port);
    w.serve();
    expect(await listening(port)).toBe(true);
    w.queue(["PLAN-0001/TASK-01"]);
    expect(await until(() => w.calls().length >= 1, 6000)).toBe(true);
    expect(w.calls()[0]).toBe("run PLAN-0001 --task TASK-01");
  });

  test("dispara o tick por evento em $GINGA_EVENTS (timer de 1h não ajuda)", async () => {
    const port = await freePort();
    const w = setup(3600, port);
    w.serve();
    expect(await listening(port)).toBe(true);
    await Bun.sleep(300);
    w.queue(["PLAN-0002/TASK-01"]);
    appendFileSync(w.events, JSON.stringify({ v: 1, ts: "2026-10-28T00:00:00Z", source: "manda", kind: "receipt", id: "0".repeat(24) + "00", data: { status: "pass", check: "verify" } }) + "\n");
    expect(await until(() => w.calls().length >= 1, 6000)).toBe(true);
    expect(w.calls()[0]).toBe("run PLAN-0002 --task TASK-01");
  });

  test("o serve usa o mesmo tick: a TASK despachada é registrada no state.db", async () => {
    const port = await freePort();
    const w = setup(1, port);
    w.serve();
    expect(await listening(port)).toBe(true);
    w.queue(["PLAN-0001/TASK-01"]);
    expect(await until(() => w.calls().length >= 1, 6000)).toBe(true);
    await Bun.sleep(500);
    const db = ((await import(join(ROOT, "src", "state", "db.ts"))) as any).openStateDb(join(w.dir, "state.db"));
    expect(db.query("SELECT plan, task, status FROM task_exec").all()).toEqual([{ plan: "PLAN-0001", task: "TASK-01", status: "dispatched" }]);
    db.close();
  });

  test("--host diferente de 127.0.0.1: exit 2 sem subir", async () => {
    const port = await freePort();
    const w = setup(1, port);
    const p = w.serve(["--host", "0.0.0.0"]);
    expect(await p.exited).toBe(2);
  });
});

describe("contrib", () => {
  const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

  test("units systemd --user chamam ginga tick / ginga serve", () => {
    expect(read("contrib/systemd/ginga-tick.service")).toMatch(/^ExecStart=.*ginga tick/m);
    expect(read("contrib/systemd/ginga-tick.timer")).toMatch(/\[Timer\][\s\S]*(OnUnitActiveSec|OnCalendar)=/);
    expect(read("contrib/systemd/ginga-tick.timer")).toMatch(/^WantedBy=timers\.target/m);
    const serve = read("contrib/systemd/ginga-serve.service");
    expect(serve).toMatch(/^ExecStart=.*ginga serve/m);
    expect(serve).toMatch(/^WantedBy=default\.target/m);
  });

  test("docs/hermes-cron.md mostra o cron chamando ginga tick", () => {
    expect(read("docs/hermes-cron.md")).toContain("ginga tick");
  });
});
