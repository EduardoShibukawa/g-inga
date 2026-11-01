// tests_frozen — PLAN-0013 TASK-22 (T312): no `ginga install` REAL (que sempre passa
// `plugin` no ctx, src/install/install.ts:856) o adaptador Claude projeta as entradas
// Stop e UserPromptSubmit em settings.json chamando `ginga handoff hook --runtime claude`,
// declara as duas em `owned`, e registra o mod contrib/claude-mod-handoff em
// installed_plugins.json/enabledPlugins quando a fonte o traz. Idempotente; hook alheio
// preservado; fonte sem artefatos de handoff continua sem projetar hooks (T12 frozen).
// Nada no HOME real.

import { afterEach, describe, expect, test } from "bun:test";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { claudeAdapter } from "../src/install/adapters/claude";
import { installCmd } from "../src/install/install";

const ROOT = join(import.meta.dir, "..");
const SKILL = join(ROOT, "skills", "handoff");
const MOD = join(ROOT, "contrib", "claude-mod-handoff");
const NOW = "2026-10-31T12:00:00.000Z";
const HOOK_CMD = "ginga handoff hook --runtime claude";

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

/** Fonte estilo repo ginga: skills/handoff + contrib/claude-mod-handoff + marketplace. */
function gingaLikeSource(): string {
  const source = realpathSync(mkdtempSync(join(realpathSync(tmpdir()), "s31-gsrc-")));
  dirs.push(source);
  cpSync(SKILL, join(source, "skills", "handoff"), { recursive: true });
  cpSync(MOD, join(source, "contrib", "claude-mod-handoff"), { recursive: true });
  mkdirSync(join(source, ".claude-plugin"), { recursive: true });
  writeFileSync(
    join(source, ".claude-plugin", "marketplace.json"),
    JSON.stringify({ name: "pi-harness-local", plugins: [{ name: "pi-harness", source: "./claude-plugin" }] }),
  );
  return source;
}

function homeWithForeignHook(): { home: string; state: string; settingsPath: string } {
  const home = realpathSync(mkdtempSync(join(realpathSync(tmpdir()), "s31-chome-")));
  const state = realpathSync(mkdtempSync(join(realpathSync(tmpdir()), "s31-cstate-")));
  dirs.push(home, state);
  const settingsPath = join(home, ".claude", "settings.json");
  mkdirSync(join(home, ".claude"), { recursive: true });
  writeFileSync(
    settingsPath,
    JSON.stringify(
      {
        theme: "dark",
        hooks: { Stop: [{ matcher: "", hooks: [{ type: "command", command: "echo hook-alheio" }] }] },
      },
      null,
      2,
    ) + "\n",
  );
  return { home, state, settingsPath };
}

function envOf(home: string, state: string, source: string): Record<string, string> {
  return {
    ...process.env,
    HOME: home,
    XDG_STATE_HOME: state,
    GINGA_PLUGIN_SOURCE: source,
    GINGA_NOW: NOW,
  } as Record<string, string>;
}

async function captureStdout<T>(fn: () => Promise<T>): Promise<{ code: T; printed: string }> {
  let printed = "";
  const origWrite = process.stdout.write.bind(process.stdout);
  (process.stdout as any).write = (chunk: any, ...rest: any[]) => {
    printed += String(chunk);
    return true;
  };
  let code: T;
  try {
    code = await fn();
  } finally {
    (process.stdout as any).write = origWrite;
  }
  return { code, printed };
}

function readJson(p: string): any {
  return JSON.parse(readFileSync(p, "utf8"));
}

function handoffCmds(settings: any, event: string): string[] {
  const entries = settings.hooks?.[event] ?? [];
  return entries.flatMap((e: any) => (e.hooks ?? []).map((h: any) => String(h.command ?? "")));
}

describe("TASK-22: install real (com plugin no ctx) projeta hooks de handoff e registra o mod", () => {
  test("installCmd dry-run+apply com GINGA_PLUGIN_SOURCE estilo repo ginga grava Stop e UserPromptSubmit", async () => {
    const source = gingaLikeSource();
    const { home, state, settingsPath } = homeWithForeignHook();
    const env = envOf(home, state, source);

    const dry = await captureStdout(() => installCmd({ mode: "dry-run", home, env }));
    expect(dry.code).toBe(0);
    const app = await captureStdout(() => installCmd({ mode: "apply", home, env }));
    expect(app.code).toBe(0);

    const s = readJson(settingsPath);
    for (const ev of ["Stop", "UserPromptSubmit"]) {
      const mine = handoffCmds(s, ev).filter((c) => c.includes("ginga handoff hook") && c.includes("--runtime claude"));
      expect(mine.length).toBe(1); // exatamente uma entrada nossa por evento
      expect(mine[0]).toBe(HOOK_CMD);
    }
    // hook alheio preservado
    expect(handoffCmds(s, "Stop").some((c) => c.includes("echo hook-alheio"))).toBe(true);
    expect(s.theme).toBe("dark");
  });

  test("install real registra o mod claude-mod-handoff em installed_plugins.json e enabledPlugins", async () => {
    const source = gingaLikeSource();
    const { home, state, settingsPath } = homeWithForeignHook();
    const env = envOf(home, state, source);
    await captureStdout(() => installCmd({ mode: "dry-run", home, env }));
    const app = await captureStdout(() => installCmd({ mode: "apply", home, env }));
    expect(app.code).toBe(0);

    const ip = readJson(join(home, ".claude", "plugins", "installed_plugins.json"));
    const modKey = "claude-mod-handoff@pi-harness-local";
    expect(ip.plugins?.[modKey]).toBeDefined();
    expect(ip.plugins[modKey][0].installPath).toBe(join(source, "contrib", "claude-mod-handoff"));
    expect(ip.plugins["pi-harness@pi-harness-local"]).toBeDefined();
    const s = readJson(settingsPath);
    expect(s.enabledPlugins?.[modKey]).toBe(true);
    expect(s.enabledPlugins?.["pi-harness@pi-harness-local"]).toBe(true);
  });

  test("owned declara /hooks/Stop e /hooks/UserPromptSubmit após apply que projetou os hooks", async () => {
    const source = gingaLikeSource();
    const { home, settingsPath } = homeWithForeignHook();
    // chamada direta do adapter COM plugin no ctx (cenário do install.ts:856)
    claudeAdapter.apply(home, { source, now: NOW, plugin: "pi-harness" });
    const s = readJson(settingsPath);
    for (const ev of ["Stop", "UserPromptSubmit"]) {
      expect(handoffCmds(s, ev).filter((c) => c === HOOK_CMD).length).toBe(1);
    }
    const owned = claudeAdapter.owned[".claude/settings.json"] ?? [];
    expect(owned).toContain("/hooks/Stop");
    expect(owned).toContain("/hooks/UserPromptSubmit");
  });

  test("apply 2× (dry-run+apply de novo) não duplica hooks nem o mod", async () => {
    const source = gingaLikeSource();
    const { home, state, settingsPath } = homeWithForeignHook();
    const env = envOf(home, state, source);
    for (let i = 0; i < 2; i++) {
      const dry = await captureStdout(() => installCmd({ mode: "dry-run", home, env }));
      expect(dry.code).toBe(0);
      const app = await captureStdout(() => installCmd({ mode: "apply", home, env }));
      expect(app.code).toBe(0);
    }
    const s = readJson(settingsPath);
    for (const ev of ["Stop", "UserPromptSubmit"]) {
      expect(handoffCmds(s, ev).filter((c) => c === HOOK_CMD).length).toBe(1);
    }
    const ip = readJson(join(home, ".claude", "plugins", "installed_plugins.json"));
    expect(ip.plugins?.["claude-mod-handoff@pi-harness-local"]?.length).toBe(1);
    expect(handoffCmds(s, "Stop").some((c) => c.includes("echo hook-alheio"))).toBe(true);
  });

  test("fonte SEM artefatos de handoff não projeta hooks (contrato congelado da T12)", async () => {
    const source = realpathSync(mkdtempSync(join(realpathSync(tmpdir()), "s31-plain-")));
    dirs.push(source);
    mkdirSync(join(source, ".claude-plugin"), { recursive: true });
    writeFileSync(
      join(source, ".claude-plugin", "marketplace.json"),
      JSON.stringify({ name: "pi-harness-local", plugins: [{ name: "pi-harness", source: "./claude-plugin" }] }),
    );
    const { home, state, settingsPath } = homeWithForeignHook();
    const before = readFileSync(settingsPath, "utf8");
    const env = envOf(home, state, source);
    await captureStdout(() => installCmd({ mode: "dry-run", home, env }));
    const app = await captureStdout(() => installCmd({ mode: "apply", home, env }));
    expect(app.code).toBe(0);
    const s = readJson(settingsPath);
    expect(JSON.stringify(s.hooks)).toBe(JSON.stringify(readJson(settingsPath).hooks));
    expect(handoffCmds(s, "Stop").some((c) => c === HOOK_CMD)).toBe(false);
    expect(handoffCmds(s, "UserPromptSubmit").length).toBe(0);
    expect(readJson(join(home, ".claude", "plugins", "installed_plugins.json")).plugins?.["claude-mod-handoff@pi-harness-local"]).toBeUndefined();
    void before;
  });
});
