// tests_frozen — PLAN-0013 TASK-23 (T313): correções do judge 2026-10-31T22:35 em
// src/install/install.ts. (1) Projeção de skills idempotente: o 2º --dry-run após
// --apply imprime nada de `=== skills ===` (só destinos pendentes) e o --revert
// remove as skills instaladas pelo apply (SKILL.md idêntico ao da fonte), sem
// tocar skill alheia. (2) Guarda A2: ponteiro `owned` sob prefixo `append` não é
// homônima — install real com hook Stop alheio preexistente sai exit 0 e projeta
// os hooks de handoff (TASK-22). Nada no HOME real.

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
import { installCmd } from "../src/install/install";

const ROOT = join(import.meta.dir, "..");
const SKILL = join(ROOT, "skills", "handoff");
const MOD = join(ROOT, "contrib", "claude-mod-handoff");
const NOW = "2026-10-31T23:00:00.000Z";
const HOOK_CMD = "ginga handoff hook --runtime claude";

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function mkSource(withHandoffArtifacts: boolean): string {
  const source = realpathSync(mkdtempSync(join(realpathSync(tmpdir()), "s32-src-")));
  dirs.push(source);
  if (withHandoffArtifacts) {
    cpSync(SKILL, join(source, "skills", "handoff"), { recursive: true });
    cpSync(MOD, join(source, "contrib", "claude-mod-handoff"), { recursive: true });
  }
  mkdirSync(join(source, ".claude-plugin"), { recursive: true });
  writeFileSync(
    join(source, ".claude-plugin", "marketplace.json"),
    JSON.stringify({ name: "pi-harness-local", plugins: [{ name: "pi-harness", source: "./claude-plugin" }] }),
  );
  return source;
}

function mkHome(opts: { foreignHook?: boolean; foreignSkill?: boolean } = {}): { home: string; state: string; settingsPath: string } {
  const home = realpathSync(mkdtempSync(join(realpathSync(tmpdir()), "s32-home-")));
  const state = realpathSync(mkdtempSync(join(realpathSync(tmpdir()), "s32-state-")));
  dirs.push(home, state);
  const settingsPath = join(home, ".claude", "settings.json");
  mkdirSync(join(home, ".claude"), { recursive: true });
  if (opts.foreignHook) {
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
  }
  if (opts.foreignSkill) {
    const foreign = join(home, ".claude", "skills", "outra", "SKILL.md");
    mkdirSync(join(home, ".claude", "skills", "outra"), { recursive: true });
    writeFileSync(foreign, "---\nname: outra\n---\n");
  }
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

const SKILL_DESTS = [
  ".claude/skills/handoff/SKILL.md",
  ".config/opencode/skills/handoff/SKILL.md",
  ".pi/agent/skills/handoff/SKILL.md",
];

describe("TASK-23: dry-run/revert de skills idempotentes + guarda A2 sob append", () => {
  test("2º dry-run após apply não imprime skills; revert remove as instaladas e preserva alheia", async () => {
    const source = mkSource(true);
    const { home, state } = mkHome({ foreignSkill: true });
    const env = envOf(home, state, source);

    const dry1 = await captureStdout(() => installCmd({ mode: "dry-run", home, env }));
    expect(dry1.code).toBe(0);
    expect(dry1.printed).toContain("=== skills ===");
    expect(dry1.printed).toContain("+ .claude/skills/handoff/SKILL.md");

    const app = await captureStdout(() => installCmd({ mode: "apply", home, env }));
    expect(app.code).toBe(0);
    for (const rel of SKILL_DESTS) expect(existsSync(join(home, rel))).toBe(true);

    const dry2 = await captureStdout(() => installCmd({ mode: "dry-run", home, env }));
    expect(dry2.code).toBe(0);
    expect(dry2.printed).not.toContain("=== skills ===");

    const rev = await captureStdout(() => installCmd({ mode: "revert", home, env }));
    expect(rev.code).toBe(0);
    for (const rel of SKILL_DESTS) expect(existsSync(join(home, rel))).toBe(false);
    // skill alheia intacta
    expect(readFileSync(join(home, ".claude", "skills", "outra", "SKILL.md"), "utf8")).toBe("---\nname: outra\n---\n");
  });

  test("guarda A2: owned /hooks/Stop sob append com hook alheio preexistente não é homônima (exit 0)", async () => {
    const source = mkSource(true);
    const { home, state, settingsPath } = mkHome({ foreignHook: true });
    const env = envOf(home, state, source);

    const dry = await captureStdout(() => installCmd({ mode: "dry-run", home, env }));
    expect(dry.code).toBe(0);
    const app = await captureStdout(() => installCmd({ mode: "apply", home, env }));
    expect(app.code).toBe(0);

    const s = JSON.parse(readFileSync(settingsPath, "utf8"));
    const stopCmds: string[] = (s.hooks?.Stop ?? []).flatMap((e: any) => (e.hooks ?? []).map((h: any) => String(h.command ?? "")));
    expect(stopCmds.filter((c) => c === HOOK_CMD).length).toBe(1);
    expect(stopCmds.some((c) => c.includes("echo hook-alheio"))).toBe(true);
    const upsCmds: string[] = (s.hooks?.UserPromptSubmit ?? []).flatMap((e: any) => (e.hooks ?? []).map((h: any) => String(h.command ?? "")));
    expect(upsCmds.filter((c) => c === HOOK_CMD).length).toBe(1);
    expect(s.theme).toBe("dark");

    // idempotente: 2º dry-run+apply segue exit 0 sem duplicar
    const dry2 = await captureStdout(() => installCmd({ mode: "dry-run", home, env }));
    expect(dry2.code).toBe(0);
    const app2 = await captureStdout(() => installCmd({ mode: "apply", home, env }));
    expect(app2.code).toBe(0);
    const s2 = JSON.parse(readFileSync(settingsPath, "utf8"));
    const stop2: string[] = (s2.hooks?.Stop ?? []).flatMap((e: any) => (e.hooks ?? []).map((h: any) => String(h.command ?? "")));
    expect(stop2.filter((c) => c === HOOK_CMD).length).toBe(1);
  });
});
