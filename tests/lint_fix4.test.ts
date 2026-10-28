import { afterEach, beforeEach, expect, test } from "bun:test";
import { cpSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Judge rodada 4 (Codex): TASK-*.md fora do padrão recebe o erro de NOME mesmo sem frontmatter válido.
const ROOT = join(import.meta.dir, "..");
const OK = join(ROOT, "tests", "fixtures", "bundle-ok");
let tmp: string;
beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), "ginga-fix4-")); cpSync(OK, join(tmp, "b"), { recursive: true }); });
afterEach(() => rmSync(tmp, { recursive: true, force: true }));
const lint = () => {
  const r = Bun.spawnSync(["bun", join(ROOT, "bin/ginga.ts"), "lint", join(tmp, "b")], { cwd: ROOT, stdout: "pipe", stderr: "pipe" });
  return { code: r.exitCode, out: r.stdout.toString() + r.stderr.toString() };
};
for (const [name, body] of Object.entries({ "sem frontmatter": "só texto\n", "frontmatter quebrado": "---\ntype: [\n---\n" })) {
  test(`${name}: erro de nome fora do padrão para TASK-foo.md`, () => {
    writeFileSync(join(tmp, "b", "plans", "PLAN-0001-alpha", "TASK-foo.md"), body);
    const r = lint();
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/TASK-foo[^\n]*fora do padrão|fora do padrão[^\n]*TASK-foo/);
  });
}
test("TASK-03-ok.md sem frontmatter não recebe erro de nome (só o de frontmatter)", () => {
  writeFileSync(join(tmp, "b", "plans", "PLAN-0001-alpha", "TASK-03-ok.md"), "só texto\n");
  const r = lint();
  expect(r.code).not.toBe(0);
  expect(r.out).not.toMatch(/fora do padrão/);
});
