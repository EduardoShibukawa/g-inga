// tests_frozen — PLAN-0013 TASK-12 (T151): `ginga handoff hook --runtime`.
//
// Interface do PLAN.md: `transcriptUsage(path)` em src/handoff/transcript_usage.ts
// → { contextTokens, lastApiTs } (soma input + cache_read + cache_creation do
// ÚLTIMO usage do transcript JSONL; sem usage → contextTokens -1);
// `runHook(runtime, stdin, deps)` em src/handoff/hook.ts →
// { decision?: "block", reason?: string }. stdin: { session_id, transcript_path,
// cwd, prompt?, hook_event_name }; UserPromptSubmit → evento "prompt", Stop →
// "turn_end"; prompt com prefixo "!!" ignora o gatilho; estado (1 redirect por
// sessão, depth, último handoff) em <cwd>/.ginga/state/handoff-<session>.json;
// redirect → { decision: "block", reason: "sessão nova <id>: claude attach <id>" }
// (id devolvido por deps.open ou o caminho do handoff); prepare → grava o
// handoff e sai sem bloquear. Toda decisão passa por decideHandoff (TASK-10).
// Teste: transcripts redigidos (ocioso/frio, 120k, !!, não interativo) → saída exata.
// Import dinâmico: RED por asserção.

import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");
const TR = join(ROOT, "tests", "fixtures", "transcripts");
const usageMod = await import("../src/handoff/transcript_usage.ts").catch(() => null);
const hookMod = await import("../src/handoff/hook.ts").catch(() => null);

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

const NOW = new Date("2026-10-30T12:00:00Z"); // transcripts são 10:00–11:59

function tmpWs(): string {
  const D = realpathSync(mkdtempSync(join(realpathSync(tmpdir()), "hook-")));
  dirs.push(D);
  mkdirSync(join(D, ".ginga"), { recursive: true });
  writeFileSync(
    join(D, ".ginga", "project.toml"),
    '[handoff]\nmode = "auto"\nidle_min = 55\ncontext_tokens = 110000\nmin_context_tokens = 30000\ncooldown_min = 30\nmax_chain = 3\n',
  );
  return D;
}

describe("transcriptUsage (src/handoff/transcript_usage.ts)", () => {
  test("módulo existe e exporta transcriptUsage", () => {
    expect(usageMod).not.toBeNull();
    expect(typeof (usageMod as any)?.transcriptUsage).toBe("function");
  });

  test("soma input+cache_read+cache_creation do último usage; sem usage → -1", () => {
    if (!usageMod) throw new Error("src/handoff/transcript_usage.ts não existe ainda (RED)");
    const ocioso = (usageMod as any).transcriptUsage(join(TR, "ocioso.jsonl"));
    expect(ocioso.contextTokens).toBe(40000); // 1000 + 30000 + 9000
    expect(ocioso.lastApiTs).toEqual(new Date("2026-10-30T10:00:05.000Z"));
    const grande = (usageMod as any).transcriptUsage(join(TR, "120k.jsonl"));
    expect(grande.contextTokens).toBe(120000); // 20000 + 90000 + 10000
    const sem = (usageMod as any).transcriptUsage(join(TR, "sem-usage.jsonl"));
    expect(sem.contextTokens).toBe(-1);
    expect(sem.lastApiTs).toBeNull();
  });
});

describe("runHook (src/handoff/hook.ts)", () => {
  test("módulo existe e exporta runHook", () => {
    expect(hookMod).not.toBeNull();
    expect(typeof (hookMod as any)?.runHook).toBe("function");
  });

  test("UserPromptSubmit com transcript ocioso (cache frio) → block com sessão nova", async () => {
    if (!hookMod) throw new Error("src/handoff/hook.ts não existe ainda (RED)");
    const cwd = tmpWs();
    const stdin = JSON.stringify({
      session_id: "ses_aaa",
      transcript_path: join(TR, "ocioso.jsonl"),
      cwd,
      hook_event_name: "UserPromptSubmit",
      prompt: "continua",
    });
    const opened: string[] = [];
    const out = await (hookMod as any).runHook("claude", stdin, {
      now: NOW,
      open: async () => {
        opened.push("open");
        return { sessionRef: "ses_nova123" };
      },
    });
    expect(out.decision).toBe("block");
    expect(out.reason).toContain("ses_nova123");
    expect(out.reason).toContain("claude attach ses_nova123");
    // estado persistido: 1 redirect por sessão
    const st = join(cwd, ".ginga", "state", "handoff-ses_aaa.json");
    expect(existsSync(st)).toBe(true);
    const state = JSON.parse(readFileSync(st, "utf8"));
    expect(state.redirected).toBe(true);
  });

  test("Stop com 120k (≥ context_tokens) → prepare: grava handoff e NÃO bloqueia", async () => {
    if (!hookMod) throw new Error("RED");
    const cwd = tmpWs();
    const stdin = JSON.stringify({
      session_id: "ses_bbb",
      transcript_path: join(TR, "120k.jsonl"),
      cwd,
      hook_event_name: "Stop",
    });
    const out = await (hookMod as any).runHook("claude", stdin, { now: NOW });
    expect(out.decision).toBeUndefined();
    const handoffs = join(cwd, "handoffs");
    expect(existsSync(handoffs)).toBe(true);
  });

  test("prompt com prefixo !! ignora o gatilho → sem decisão", async () => {
    if (!hookMod) throw new Error("RED");
    const cwd = tmpWs();
    const stdin = JSON.stringify({
      session_id: "ses_ccc",
      transcript_path: join(TR, "ocioso.jsonl"),
      cwd,
      hook_event_name: "UserPromptSubmit",
      prompt: "!! continua sem handoff",
    });
    const out = await (hookMod as any).runHook("claude", stdin, { now: NOW });
    expect(out.decision).toBeUndefined();
    expect(out.reason).toBeUndefined();
  });

  test("sessão não interativa (sem transcript_path) → sem decisão e sem handoff", async () => {
    if (!hookMod) throw new Error("RED");
    const cwd = tmpWs();
    const stdin = JSON.stringify({ session_id: "ses_pp", cwd, hook_event_name: "UserPromptSubmit", prompt: "oi" });
    const out = await (hookMod as any).runHook("claude", stdin, { now: NOW });
    expect(out.decision).toBeUndefined();
    expect(existsSync(join(cwd, "handoffs"))).toBe(false);
  });

  test("cache quente (última API recente) e contexto baixo → nenhuma ação", async () => {
    if (!hookMod) throw new Error("RED");
    const cwd = tmpWs();
    const stdin = JSON.stringify({
      session_id: "ses_ddd",
      transcript_path: join(TR, "quente.jsonl"),
      cwd,
      hook_event_name: "UserPromptSubmit",
      prompt: "segue",
    });
    const out = await (hookMod as any).runHook("claude", stdin, { now: NOW });
    expect(out.decision).toBeUndefined();
  });
});
