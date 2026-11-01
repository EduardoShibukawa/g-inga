// tests_frozen — PLAN-0013 TASK-28 (T319): follow-up do judge 2026-11-01.
//
// Achado: o evento `handoff` emitido pelo `--open` sai com trigger "cache" e
// depth 0 FIXOS (src/handoff/open.ts:83 e src/handoff/open_claude.ts), então o
// ingest não consegue distinguir uma abertura manual da sessão.
//
// Contrato:
// - `OpenSessionOpts` ganha `trigger?: string` e `depth?: number`.
// - `openSession` (claude E outros runtimes) emite kind=handoff com
//   data.trigger = o.trigger ?? "manual" e data.depth = o.depth ?? 0.
// - O verbo `handoff --open` passa trigger = --trigger ?? "manual" e
//   depth = --depth (quando dado) para o openSession.
// - Sem --open o verbo não muda (continua emitindo o próprio evento).
// Import dinâmico onde preciso: RED por asserção.

import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validateEvent } from "../src/events/validate";

const openMod = await import("../src/handoff/open.ts").catch(() => null);

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  delete process.env.GINGA_EVENTS;
});

function tmpDir(): string {
  const D = realpathSync(mkdtempSync(join(realpathSync(tmpdir()), "open-trig-")));
  dirs.push(D);
  return D;
}

type Spawn = (cmd: string[], args: string[], opts: { cwd: string }) => { stdout: string; exitCode: number };

function lastEvent(eventsPath: string): any {
  const lines = readFileSync(eventsPath, "utf8").trim().split("\n");
  return JSON.parse(lines[lines.length - 1]!);
}

describe("TASK-28: evento do --open com trigger/depth reais", () => {
  test("opencode (sem spawn): evento com trigger 'manual' e depth de opts", async () => {
    if (!openMod) throw new Error("src/handoff/open.ts não existe (RED)");
    const cwd = tmpDir();
    const events = join(cwd, "events.jsonl");
    process.env.GINGA_EVENTS = events;
    const spawn: Spawn = () => ({ stdout: "", exitCode: 0 });
    const out = await (openMod as any).openSession("opencode", {
      handoffPath: join(cwd, "handoffs", "HANDOFF-2026-11-01-PLAN-0013.md"),
      userPrompt: "continua",
      model: "glm",
      cwd,
      spawn,
      depth: 2,
    });
    expect(out.attachCmd).toContain("opencode");
    const ev = lastEvent(events);
    expect(ev.kind).toBe("handoff");
    expect(ev.data.trigger).toBe("manual"); // hoje sai "cache" fixo → RED
    expect(ev.data.depth).toBe(2); // hoje sai 0 fixo → RED
    expect(validateEvent(ev).ok).toBe(true);
  });

  test("claude: evento respeita trigger/depth passados nas opts", async () => {
    if (!openMod) throw new Error("RED");
    const cwd = tmpDir();
    const events = join(cwd, "events.jsonl");
    process.env.GINGA_EVENTS = events;
    const spawn: Spawn = () => ({ stdout: "ses_xyz\n", exitCode: 0 });
    await (openMod as any).openSession("claude", {
      handoffPath: join(cwd, "handoffs", "HANDOFF-2026-11-01-PLAN-0013.md"),
      userPrompt: "continua",
      model: "sonnet",
      cwd,
      spawn,
      trigger: "idle",
      depth: 3,
    });
    const ev = lastEvent(events);
    expect(ev.data.trigger).toBe("idle"); // hoje "cache" fixo → RED
    expect(ev.data.depth).toBe(3); // hoje 0 fixo → RED
    expect(validateEvent(ev).ok).toBe(true);
  });

  test("sem trigger nas opts: default 'manual' (não 'cache')", async () => {
    if (!openMod) throw new Error("RED");
    const cwd = tmpDir();
    const events = join(cwd, "events.jsonl");
    process.env.GINGA_EVENTS = events;
    const spawn: Spawn = () => ({ stdout: "", exitCode: 0 });
    await (openMod as any).openSession("pi", {
      handoffPath: join(cwd, "handoffs", "H.md"),
      userPrompt: "continua",
      model: "glm",
      cwd,
      spawn,
    });
    const ev = lastEvent(events);
    expect(ev.data.trigger).toBe("manual");
    expect(ev.data.depth).toBe(0);
    expect(validateEvent(ev).ok).toBe(true);
  });
});
