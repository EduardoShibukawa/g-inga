import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * PLAN-0014 TASK-14: o README do ginga traz a instrução de ativar a statusline
 * do Claude para o dono (ressalva simples do judge 2026-11-03T02:50, TASK-03):
 * a seção cita `contrib/claude-statusline.sh` e `~/.claude/settings.json`, e
 * deixa claro que o ginga não edita o settings.json (ativar é ação do dono).
 */

const ROOT = join(import.meta.dir, "..");

describe("README: instrução da statusline do Claude", () => {
  const readmePath = join(ROOT, "README.md");

  test("README existe", () => {
    expect(existsSync(readmePath)).toBe(true);
  });

  test("há seção sobre a statusline do Claude", () => {
    const readme = readFileSync(readmePath, "utf8");
    expect(readme).toMatch(/^#+\s*.*statusline.*$/im);
  });

  test("a instrução aponta o script contrib/claude-statusline.sh", () => {
    const readme = readFileSync(readmePath, "utf8");
    expect(readme).toContain("contrib/claude-statusline.sh");
  });

  test("a instrução cita ~/.claude/settings.json e diz que ativar é ação do dono", () => {
    const readme = readFileSync(readmePath, "utf8");
    expect(readme).toContain(".claude/settings.json");
    expect(readme).toMatch(/dono/);
  });
});
