import { afterEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import { appendFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getVerb, runVerb } from "../src/verbs/registry";
import { openStateDb } from "../src/state/db";

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

async function listening(port: number): Promise<boolean> {
  const end = Date.now() + 8000;
  while (Date.now() < end) {
    try {
      await fetch(`http://127.0.0.1:${port}/`);
      return true;
    } catch {
      await Bun.sleep(50);
    }
  }
  return false;
}

function makeWorkspace(): string {
  const ws = realpathSync(mkdtempSync(join(realpathSync(tmpdir()), "ginga-index-cli-")));
  dirs.push(ws);
  mkdirSync(join(ws, ".ginga", "intents"), { recursive: true });
  writeFileSync(
    join(ws, ".ginga", "intents", "INTENT-0001-teste.md"),
    '---\nid: INTENT-0001\nkind: intent\nstatus: draft\ntitle: Teste\n---\n',
  );
  cpSync(join(ROOT, "tests", "fixtures", "index", "template.md"), join(ws, ".ginga", "index.template.md"));
  return ws;
}

function ctxFor(ws: string) {
  return { by: "test", via: "cli", root: join(ws, ".ginga"), db: openStateDb(join(ws, "state.db")) };
}

describe("verbo index (PLAN-0012 TASK-14, follow-up do judge na TASK-06)", () => {
  test("verbo index registrado com flag bool check", () => {
    const v = getVerb("index");
    expect(v).toBeDefined();
    expect(v!.args.some((a) => a.name === "check" && a.bool === true)).toBe(true);
  });

  test("runVerb index grava .ginga/index.md gerado e é idempotente", async () => {
    const ws = makeWorkspace();
    const ctx = ctxFor(ws);
    try {
      const r1 = (await runVerb("index", ctx, {})) as any;
      expect(r1.changed).toBe(true);
      const out = readFileSync(join(ws, ".ginga", "index.md"), "utf8");
      expect(out).toContain("> gerado por ginga");
      expect(out).toContain('okf: "0.1"');
      const r2 = (await runVerb("index", ctx, {})) as any;
      expect(r2.changed).toBe(false);
    } finally {
      ctx.db.close();
    }
  });

  test("runVerb index --check lança erro (CLI sai 1) com index.md desatualizado", async () => {
    const ws = makeWorkspace();
    const ctx = ctxFor(ws);
    try {
      await runVerb("index", ctx, {});
      writeFileSync(join(ws, ".ginga", "index.md"), "desatualizado\n");
      await expect(runVerb("index", ctx, { check: "true" })).rejects.toThrow(/desatualizado/);
      await runVerb("index", ctx, {});
      const ok = (await runVerb("index", ctx, { check: "true" })) as any;
      expect(ok.ok).toBe(true);
    } finally {
      ctx.db.close();
    }
  });

  test("serve regenera .ginga/index.md ao receber evento transition em $GINGA_EVENTS", async () => {
    const ws = makeWorkspace();
    const out = join(ws, ".ginga", "index.md");
    rmSync(out, { force: true });
    const port = await freePort();
    const events = join(ws, "events.jsonl");
    writeFileSync(events, "");
    writeFileSync(join(ws, ".ginga", "project.toml"), `[serve]\ntick_seconds = 3600\nport = ${port}\n`);
    const env = {
      PATH: process.env.PATH ?? "",
      HOME: ws,
      GINGA_STATE_DB: join(ws, "state.db"),
      GINGA_EVENTS: events,
    };
    const p = Bun.spawn(["bun", BIN, "serve", "--root", ws], { cwd: ws, env, stdout: "pipe", stderr: "pipe" });
    procs.push(p);
    expect(await listening(port)).toBe(true);
    appendFileSync(
      events,
      JSON.stringify({ v: 1, ts: new Date().toISOString(), id: "e1", kind: "transition", entity: "plan", from: "approval", to: "done", by: "test", via: "cli" }) + "\n",
    );
    const end = Date.now() + 15000;
    while (Date.now() < end && !existsSync(out)) await Bun.sleep(250);
    expect(existsSync(out)).toBe(true);
    expect(readFileSync(out, "utf8")).toContain("> gerado por ginga");
  });
});
