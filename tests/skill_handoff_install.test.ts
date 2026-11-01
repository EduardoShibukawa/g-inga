// tests_frozen — PLAN-0013 TASK-21 (T311): skill `handoff` projetada de <source>/skills/
// (fonte única do repo ginga) e instalada de fato pelo --apply.
//
// Congela a TASK: `sourceSkills`/`projectSkillsOutput` (src/install/install.ts) leem a
// UNIÃO de `<source>/skills/` e `<source>/.pi/skills/`; o dry-run lista os 3 destinos
// (.claude/skills, .config/opencode/skills, .pi/agent/skills) quando há skills em
// qualquer uma das pastas; o --apply copia cada skill para os 3 destinos do HOME,
// idempotente, sem tocar skill alheia (destino com SKILL.md de conteúdo diferente é
// pulado com aviso). Fonte sem .pi/skills (só skills/) também projeta. Nada no HOME real.

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

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function mkSource(withRepoSkills: boolean, withPiSkills: boolean): string {
  const source = realpathSync(mkdtempSync(join(realpathSync(tmpdir()), "s31-src-")));
  dirs.push(source);
  if (withRepoSkills) cpSync(SKILL, join(source, "skills", "handoff"), { recursive: true });
  if (withPiSkills) cpSync(SKILL, join(source, ".pi", "skills", "handoff"), { recursive: true });
  mkdirSync(join(source, ".claude-plugin"), { recursive: true });
  writeFileSync(
    join(source, ".claude-plugin", "marketplace.json"),
    JSON.stringify({ name: "pi-harness-local", plugins: [{ name: "pi-harness", source: "./claude-plugin" }] }),
  );
  return source;
}

function mkHome(): { home: string; state: string; foreign: string; foreignBefore: string } {
  const home = realpathSync(mkdtempSync(join(realpathSync(tmpdir()), "s31-home-")));
  const state = realpathSync(mkdtempSync(join(realpathSync(tmpdir()), "s31-state-")));
  dirs.push(home, state);
  const foreign = join(home, ".claude", "skills", "outra", "SKILL.md");
  mkdirSync(join(home, ".claude", "skills", "outra"), { recursive: true });
  writeFileSync(foreign, "---\nname: outra\n---\n");
  return { home, state, foreign, foreignBefore: readFileSync(foreign, "utf8") };
}

function envOf(home: string, state: string, source: string): Record<string, string> {
  return {
    ...process.env,
    HOME: home,
    XDG_STATE_HOME: state,
    GINGA_PLUGIN_SOURCE: source,
    GINGA_NOW: "2026-10-31T12:00:00.000Z",
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

const DESTS = [
  join(".claude", "skills", "handoff", "SKILL.md"),
  join(".config", "opencode", "skills", "handoff", "SKILL.md"),
  join(".pi", "agent", "skills", "handoff", "SKILL.md"),
];

describe("TASK-21: skill de <source>/skills/ projetada no dry-run e instalada no --apply", () => {
  test("dry-run com fonte só com skills/ (sem .pi/skills) lista os 3 destinos e não escreve no HOME", async () => {
    const source = mkSource(true, false);
    const { home, state, foreign, foreignBefore } = mkHome();
    const env = envOf(home, state, source);
    const { code, printed } = await captureStdout(() => installCmd({ mode: "dry-run", home, env }));
    expect(code).toBe(0);
    const dests = printed.split("\n").filter((l) => l.includes("skills/handoff"));
    expect(dests.length).toBeGreaterThanOrEqual(3);
    expect(printed).toMatch(/\.claude\/skills\/handoff/);
    expect(printed).toMatch(/opencode/);
    expect(printed).toMatch(/\.pi\/agent\/skills\/handoff/);
    // dry-run não instala nada
    for (const d of DESTS) expect(existsSync(join(home, d))).toBe(false);
    expect(readFileSync(foreign, "utf8")).toBe(foreignBefore);
  });

  test("--apply instala a skill nos 3 destinos do HOME com o mesmo conteúdo da fonte", async () => {
    const source = mkSource(true, false);
    const { home, state } = mkHome();
    const env = envOf(home, state, source);
    const dry = await captureStdout(() => installCmd({ mode: "dry-run", home, env }));
    expect(dry.code).toBe(0);
    const app = await captureStdout(() => installCmd({ mode: "apply", home, env }));
    expect(app.code).toBe(0);
    const srcSkill = readFileSync(join(SKILL, "SKILL.md"), "utf8");
    for (const d of DESTS) {
      const p = join(home, d);
      expect(existsSync(p)).toBe(true);
      expect(readFileSync(p, "utf8")).toBe(srcSkill);
    }
  });

  test("apply 2× é idempotente e não toca skill alheia", async () => {
    const source = mkSource(true, false);
    const { home, state, foreign, foreignBefore } = mkHome();
    const env = envOf(home, state, source);
    for (let i = 0; i < 2; i++) {
      const dry = await captureStdout(() => installCmd({ mode: "dry-run", home, env }));
      expect(dry.code).toBe(0);
      const app = await captureStdout(() => installCmd({ mode: "apply", home, env }));
      expect(app.code).toBe(0);
    }
    for (const d of DESTS) expect(existsSync(join(home, d))).toBe(true);
    // skill alheia intacta
    expect(readFileSync(foreign, "utf8")).toBe(foreignBefore);
    // sem duplicação: o dir da skill tem só os arquivos da fonte
    const entries = require("node:fs").readdirSync(join(home, ".claude", "skills", "handoff"), { withFileTypes: true });
    expect(entries.filter((e: any) => e.isDirectory()).length).toBeLessThanOrEqual(2); // scripts/ references/
  });

  test("legado: fonte só com .pi/skills/handoff continua listada no dry-run (3 destinos)", async () => {
    const source = mkSource(false, true);
    const { home, state } = mkHome();
    const env = envOf(home, state, source);
    const { code, printed } = await captureStdout(() => installCmd({ mode: "dry-run", home, env }));
    expect(code).toBe(0);
    const dests = printed.split("\n").filter((l) => l.includes("skills/handoff"));
    expect(dests.length).toBeGreaterThanOrEqual(3);
  });
});
