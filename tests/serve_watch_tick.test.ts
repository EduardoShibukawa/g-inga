import { afterEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import { appendFileSync, chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

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

function setup(tickSeconds: number, port: number, eventsInitial: string) {
  const dir = realpathSync(mkdtempSync(join(realpathSync(tmpdir()), "ginga-swt-")));
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
  writeFileSync(events, eventsInitial);
  const env = { PATH: process.env.PATH ?? "", HOME: dir, GINGA_STATE_DB: join(dir, "state.db"), GINGA_EVENTS: events };
  const serve = (extra: string[] = []) => {
    const p = Bun.spawn(["bun", BIN, "serve", "--root", dir, ...extra], { cwd: dir, env, stdout: "pipe", stderr: "pipe" });
    procs.push(p);
    return p;
  };
  return { dir, events, serve };
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
    try { await fetch(`http://127.0.0.1:${port}/`); return true; } catch { return false; }
  }, 8000);

function countAlerts(eventsPath: string): number {
  if (!existsSync(eventsPath)) return 0;
  const raw = readFileSync(eventsPath, "utf8");
  return raw.trim().split("\n").filter((l) => {
    try { return JSON.parse(l).kind === "alert"; } catch { return false; }
  }).length;
}

describe("serve watch tick", () => {
  test("2 ticks com fixture no_progress geram 1 alerta", async () => {
    const port = await freePort();
    const fixture = readFileSync(join(ROOT, "tests", "fixtures", "watch", "no_progress.jsonl"), "utf8");
    const w = setup(1, port, fixture);
    w.serve();
    expect(await listening(port)).toBe(true);
    await Bun.sleep(2600);
    expect(countAlerts(w.events)).toBe(1);
  });
});
