// tests_frozen — PLAN-0013 TASK-14 (T153): skill `handoff` na fonte única + projeção.
//
// Congela a TASK: `skills/handoff/SKILL.md` (name: handoff, description) instrui
// o modelo a (1) escrever notes com decisões/preferências/hipóteses,
// (2) rodar `ginga handoff --open`, (3) encerrar o turno; `scripts/handoff.ts`
// chama a CLI e imprime {path, tokens, open}; `references/formato.md` existe.
// `ginga install --dry-run` com HOME temporário lista a projeção para Claude,
// opencode e Pi (paths com skills/handoff) sem alterar arquivo existente de
// outra skill (nada escrito no HOME no dry-run). Nada no HOME real.
// A fonte única da skill é o próprio repo ginga (skills/handoff/).

import { afterEach, describe, expect, test } from "bun:test";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { installCmd } from "../src/install/install";

const ROOT = join(import.meta.dir, "..");
const SKILL = join(ROOT, "skills", "handoff");

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function frontmatterOf(text: string): Record<string, string> {
  const m = text.match(/^---\n([\s\S]*?)\n---/);
  const out: Record<string, string> = {};
  if (!m) return out;
  for (const line of m[1]!.split("\n")) {
    const i = line.indexOf(":");
    if (i > 0) out[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return out;
}

describe("skill handoff na fonte única (skills/handoff/)", () => {
  test("SKILL.md existe com frontmatter name: handoff e description; corpo manda notes + handoff --open + encerrar", () => {
    const p = join(SKILL, "SKILL.md");
    expect(existsSync(p)).toBe(true);
    const fm = frontmatterOf(readFileSync(p, "utf8"));
    expect(fm.name).toBe("handoff");
    expect((fm.description ?? "").length).toBeGreaterThan(10);
    const body = readFileSync(p, "utf8");
    expect(body).toMatch(/notes/i);
    expect(body).toContain("handoff --open");
  });

  test("scripts/handoff.ts chama a CLI e imprime JSON {path, tokens, open}; references/formato.md existe", () => {
    const s = join(SKILL, "scripts", "handoff.ts");
    expect(existsSync(s)).toBe(true);
    const src = readFileSync(s, "utf8");
    expect(src).toContain("handoff");
    expect(src).toMatch(/tokens/);
    expect(src).toMatch(/path/);
    expect(existsSync(join(SKILL, "references", "formato.md"))).toBe(true);
  });
});

describe("ginga install --dry-run projeta a skill para claude, opencode e pi", () => {
  test("dry-run lista 3 destinos com skills/handoff e não escreve nada no HOME", async () => {
    const home = realpathSync(mkdtempSync(join(realpathSync(tmpdir()), "skill-home-")));
    const state = realpathSync(mkdtempSync(join(realpathSync(tmpdir()), "skill-state-")));
    const source = realpathSync(mkdtempSync(join(realpathSync(tmpdir()), "skill-src-")));
    dirs.push(home, state, source);
    // fonte com a skill handoff (cópia da fonte única do repo) + marketplace mínimo
    cpSync(SKILL, join(source, ".pi", "skills", "handoff"), { recursive: true });
    mkdirSync(join(source, ".claude-plugin"), { recursive: true });
    writeFileSync(
      join(source, ".claude-plugin", "marketplace.json"),
      JSON.stringify({ name: "pi-harness-local", plugins: [{ name: "pi-harness", source: "./claude-plugin" }] }),
    );
    // HOME com outra skill preexistente (não pode ser tocada)
    const foreign = join(home, ".claude", "skills", "outra", "SKILL.md");
    mkdirSync(join(home, ".claude", "skills", "outra"), { recursive: true });
    writeFileSync(foreign, "---\nname: outra\n---\n");
    const foreignBefore = readFileSync(foreign, "utf8");

    const env: Record<string, string> = {
      ...process.env,
      HOME: home,
      XDG_STATE_HOME: state,
      GINGA_PLUGIN_SOURCE: source,
      GINGA_NOW: "2026-10-30T12:00:00.000Z",
    };
    // captura o diff impresso no dry-run
    let printed = "";
    const origWrite = process.stdout.write.bind(process.stdout);
    (process.stdout as any).write = (chunk: any, ...rest: any[]) => {
      printed += String(chunk);
      return true;
    };
    let code = -1;
    try {
      code = await installCmd({ mode: "dry-run", home, env });
    } finally {
      (process.stdout as any).write = origWrite;
    }
    expect(code).toBe(0);
    const dests = printed.split("\n").filter((l) => l.includes("skills/handoff"));
    expect(dests.length).toBeGreaterThanOrEqual(3);
    expect(printed).toMatch(/\.claude\/skills\/handoff/);
    expect(printed).toMatch(/opencode/);
    expect(printed).toMatch(/\.pi\/agent\/skills\/handoff/);
    // dry-run não escreve no HOME
    expect(readFileSync(foreign, "utf8")).toBe(foreignBefore);
    expect(existsSync(join(home, ".claude", "skills", "handoff"))).toBe(false);
  });
});
