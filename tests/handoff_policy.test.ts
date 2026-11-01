// tests_frozen — PLAN-0013 TASK-10 (T149): política [handoff] + decideHandoff.
//
// Interface do PLAN.md (src/handoff/policy.ts):
//   decideHandoff(cfg, s) → { action: none|prepare|redirect, trigger: idle|context|null, reason }
//     s = { now, lastApiTs, contextTokens, interactive, depth, lastHandoffTs, event: "prompt"|"turn_end" }
//   parseHandoffCfg(toml: object, runtime) → HandoffCfg
// Regras da TASK (tabela): [handoff] mode (off|suggest|auto, padrão suggest),
// idle_min 55, context_tokens 110000, min_context_tokens 30000, cooldown_min 30,
// max_chain 3, summary off; override por runtime em [handoff.<runtime>].
// idle no evento "prompt" (now−lastApiTs > idle_min E contexto ≥ min_context_tokens)
// → redirect; context no "turn_end" (≥ context_tokens) → prepare; idle_min=0
// desliga a ociosidade; mode=suggest nunca devolve redirect; depth ≥ max_chain
// ou dentro do cooldown_min → none; sessão não interativa → none.
// `ginga lint` valida [handoff] (src/lint/project_toml.ts ligado em src/lint/index.ts):
// `mode = "x"` → erro. Import dinâmico: RED por asserção.

import { afterEach, describe, expect, test } from "bun:test";
import { cpSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { lintBundle } from "../src/lint/index";

const policyMod = await import("../src/handoff/policy.ts").catch(() => null);

const ROOT = join(import.meta.dir, "..");
const FIXTURE = join(ROOT, "tests", "fixtures", "bundle-ok");
const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

const NOW = new Date("2026-10-30T12:00:00Z");
const MIN = 60 * 1000;

function cfg(over: Record<string, unknown> = {}, runtimeOver: Record<string, unknown> = {}, runtime = "claude") {
  if (!policyMod) throw new Error("src/handoff/policy.ts não existe ainda (RED)");
  const toml: Record<string, unknown> = { handoff: { mode: "auto", ...over } };
  if (Object.keys(runtimeOver).length) toml[`handoff.${runtime}`] = runtimeOver;
  return (policyMod as any).parseHandoffCfg(toml, runtime);
}

function s(over: Record<string, unknown> = {}) {
  return {
    now: NOW,
    lastApiTs: new Date(NOW.getTime() - 60 * MIN), // 60 min ocioso
    contextTokens: 40000,
    interactive: true,
    depth: 0,
    lastHandoffTs: null,
    event: "prompt",
    ...over,
  } as any;
}

describe("parseHandoffCfg", () => {
  test("módulo existe e exporta parseHandoffCfg + decideHandoff", () => {
    expect(policyMod).not.toBeNull();
    expect(typeof (policyMod as any)?.parseHandoffCfg).toBe("function");
    expect(typeof (policyMod as any)?.decideHandoff).toBe("function");
  });

  test("padrões do doc 11 §1 e override por runtime", () => {
    if (!policyMod) throw new Error("RED");
    const d = (policyMod as any).parseHandoffCfg({}, "claude");
    expect(d.mode).toBe("suggest");
    expect(d.idle_min).toBe(55);
    expect(d.context_tokens).toBe(110000);
    expect(d.min_context_tokens).toBe(30000);
    expect(d.cooldown_min).toBe(30);
    expect(d.max_chain).toBe(3);
    const o = (policyMod as any).parseHandoffCfg({ handoff: { mode: "auto" }, "handoff.opencode": { idle_min: 0 } }, "opencode");
    expect(o.idle_min).toBe(0);
    expect(o.mode).toBe("auto");
    const base = (policyMod as any).parseHandoffCfg({ handoff: { mode: "auto" }, "handoff.opencode": { idle_min: 0 } }, "claude");
    expect(base.idle_min).toBe(55); // override não vaza para outro runtime
  });
});

describe("decideHandoff (tabela da TASK)", () => {
  test("idle: prompt após 60 min ocioso com contexto 40k → redirect (mode auto)", () => {
    if (!policyMod) throw new Error("RED");
    const r = (policyMod as any).decideHandoff(cfg(), s());
    expect(r.action).toBe("redirect");
    expect(r.trigger).toBe("idle");
  });

  test("mode = suggest nunca devolve redirect", () => {
    if (!policyMod) throw new Error("RED");
    const r = (policyMod as any).decideHandoff(cfg({ mode: "suggest" }), s());
    expect(r.action).not.toBe("redirect");
  });

  test("context: turn_end com 120k ≥ 110000 → prepare, trigger context", () => {
    if (!policyMod) throw new Error("RED");
    const r = (policyMod as any).decideHandoff(cfg(), s({ event: "turn_end", contextTokens: 120000, lastApiTs: NOW }));
    expect(r.action).toBe("prepare");
    expect(r.trigger).toBe("context");
  });

  test("idle_min = 0 desliga o gatilho de ociosidade", () => {
    if (!policyMod) throw new Error("RED");
    const r = (policyMod as any).decideHandoff(cfg({}, { idle_min: 0 }, "claude"), s());
    expect(r.trigger).not.toBe("idle");
    expect(r.action).not.toBe("redirect");
  });

  test("contexto abaixo de min_context_tokens não dispara idle", () => {
    if (!policyMod) throw new Error("RED");
    const r = (policyMod as any).decideHandoff(cfg(), s({ contextTokens: 20000 }));
    expect(r.action).toBe("none");
  });

  test("depth ≥ max_chain → none; dentro do cooldown_min → none; não interativo → none", () => {
    if (!policyMod) throw new Error("RED");
    const deep = (policyMod as any).decideHandoff(cfg(), s({ depth: 3 }));
    expect(deep.action).toBe("none");
    const cool = (policyMod as any).decideHandoff(cfg(), s({ lastHandoffTs: new Date(NOW.getTime() - 10 * MIN) }));
    expect(cool.action).toBe("none");
    const nonInt = (policyMod as any).decideHandoff(cfg(), s({ interactive: false }));
    expect(nonInt.action).toBe("none");
  });

  test("fora dos gatilhos (cache quente, contexto baixo) → none", () => {
    if (!policyMod) throw new Error("RED");
    const r = (policyMod as any).decideHandoff(cfg(), s({ lastApiTs: NOW, contextTokens: 40000, event: "turn_end" }));
    expect(r.action).toBe("none");
    expect(r.trigger).toBeNull();
  });
});

describe("lint do [handoff] (src/lint/project_toml.ts em src/lint/index.ts)", () => {
  function bundleWithToml(toml: string): string {
    const D = realpathSync(mkdtempSync(join(realpathSync(tmpdir()), "lint-handoff-")));
    dirs.push(D);
    const dst = join(D, "bundle");
    cpSync(FIXTURE, dst, { recursive: true });
    writeFileSync(join(dst, "project.toml"), toml);
    return dst;
  }

  test("[handoff] válido → sem erro novo", () => {
    const r = lintBundle(bundleWithToml('[handoff]\nmode = "auto"\nidle_min = 55\n[handoff.opencode]\nidle_min = 0\n'));
    const handoffErrs = r.errors.filter((e) => /handoff/i.test(`${e.field} ${e.message}`));
    expect(handoffErrs).toEqual([]);
  });

  test('mode = "x" → erro do lint que menciona handoff/mode', () => {
    const r = lintBundle(bundleWithToml('[handoff]\nmode = "x"\n'));
    expect(r.ok).toBe(false);
    const hit = r.errors.find((e) => /handoff|mode/i.test(`${e.field} ${e.message}`));
    expect(hit).toBeDefined();
  });
});
