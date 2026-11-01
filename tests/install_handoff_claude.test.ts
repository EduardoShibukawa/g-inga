// tests_frozen — PLAN-0013 TASK-15 (T154): adapter Claude (hooks + mod opcional).
//
// Congela a TASK: o adapter (src/install/adapters/claude.ts) acrescenta as duas
// entradas de hook em settings.json (Stop e UserPromptSubmit) que chamam
// `ginga handoff hook --runtime claude`, sem duplicar nem remover entradas
// alheias; --apply grava, o padrão só lista (dry-run); 2× --apply → as 2
// entradas uma vez só e o hook alheio intacto. `contrib/claude-mod-handoff/`
// (.claude-plugin/plugin.json, hooks/hooks.json, hooks/register.ts): JSON
// válidos com os campos `name` e `hooks`; register.ts só repassa o JSON ao
// `ginga handoff hook` (zero lógica de decisão). HOME injetável (sombra).
// Teste: HOME temporário com settings.json que já tem outro hook.

import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { claudeAdapter } from "../src/install/adapters/claude";

const ROOT = join(import.meta.dir, "..");
const MOD = join(ROOT, "contrib", "claude-mod-handoff");

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

const NOW = "2026-10-30T12:00:00.000Z";

function shadowHome(): string {
  const home = realpathSync(mkdtempSync(join(realpathSync(tmpdir()), "claude-handoff-")));
  dirs.push(home);
  const settings = {
    theme: "dark",
    hooks: {
      Stop: [{ matcher: "", hooks: [{ type: "command", command: "echo hook-alheio" }] }],
    },
  };
  const p = join(home, ".claude", "settings.json");
  mkdirSync(join(home, ".claude"), { recursive: true });
  writeFileSync(p, JSON.stringify(settings, null, 2) + "\n");
  return home;
}

function readSettings(home: string): any {
  return JSON.parse(readFileSync(join(home, ".claude", "settings.json"), "utf8"));
}

describe("adapter Claude: hooks de handoff no settings.json", () => {
  test("apply 2× → entradas Stop e UserPromptSubmit com `ginga handoff hook --runtime claude`, uma vez só, alheio intacto", () => {
    const home = shadowHome();
    const ctx = { source: "/tmp/fonte", now: NOW };
    claudeAdapter.apply(home, ctx);
    claudeAdapter.apply(home, ctx); // idempotente
    const s = readSettings(home);
    for (const ev of ["Stop", "UserPromptSubmit"]) {
      const entries = s.hooks?.[ev] ?? [];
      const ours = entries.flatMap((e: any) => (e.hooks ?? []).map((h: any) => h.command ?? ""));
      const mine = ours.filter((c: string) => c.includes("ginga handoff hook") && c.includes("--runtime claude"));
      expect(mine.length).toBe(1); // sem duplicar
    }
    // hook alheio preservado
    const stopCmds = (s.hooks.Stop ?? []).flatMap((e: any) => (e.hooks ?? []).map((h: any) => h.command ?? ""));
    expect(stopCmds.some((c: string) => c.includes("echo hook-alheio"))).toBe(true);
    // targets/owned declarados incluem settings.json
    expect(claudeAdapter.targets).toContain(".claude/settings.json");
  });

  test("dry-run não grava: apply só é chamado no --apply (alvos declarados)", () => {
    // o contrato de dry-run mora no install (modo), aqui se congela que o
    // adapter declara os ponteiros próprios em `owned` para o settings.json
    const owned = claudeAdapter.owned[".claude/settings.json"] ?? [];
    expect(owned.some((p) => p.includes("hooks"))).toBe(true);
  });
});

describe("contrib/claude-mod-handoff/", () => {
  test(".claude-plugin/plugin.json e hooks/hooks.json são JSON válidos com name e hooks", () => {
    const pj = join(MOD, ".claude-plugin", "plugin.json");
    const hj = join(MOD, "hooks", "hooks.json");
    expect(existsSync(pj)).toBe(true);
    expect(existsSync(hj)).toBe(true);
    const plugin = JSON.parse(readFileSync(pj, "utf8"));
    expect(typeof plugin.name).toBe("string");
    expect(plugin.name).toContain("handoff");
    const hooks = JSON.parse(readFileSync(hj, "utf8"));
    expect(Array.isArray(hooks.hooks)).toBe(true);
    expect(hooks.hooks.length).toBeGreaterThanOrEqual(2); // Stop + UserPromptSubmit
  });

  test("hooks/register.ts só repassa o JSON ao ginga handoff hook (zero lógica de decisão)", () => {
    const reg = join(MOD, "hooks", "register.ts");
    expect(existsSync(reg)).toBe(true);
    const src = readFileSync(reg, "utf8");
    expect(src).toContain("ginga handoff hook");
    expect(src).not.toMatch(/decideHandoff|idle_min|context_tokens\s*=/); // sem decisão própria
  });
});
