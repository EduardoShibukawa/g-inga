import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";

const ROOT = join(import.meta.dir, "..");
const OK = join(ROOT, "tests", "fixtures", "bundle-ok");

function ginga(args: string[]) {
  const r = Bun.spawnSync(["bun", join(ROOT, "bin/ginga.ts"), ...args], { cwd: ROOT, stdout: "pipe", stderr: "pipe" });
  return { code: r.exitCode, out: r.stdout.toString() + r.stderr.toString() };
}
function walk(dir: string, root = dir): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p, root) : [relative(root, p)];
  }).sort();
}
const snapshot = (dir: string) => Object.fromEntries(walk(dir).map((f) => [f, readFileSync(join(dir, f), "utf8")]));

let tmp: string;
let bundle: string;
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "ginga-fix2-"));
  bundle = join(tmp, "b");
  cpSync(OK, bundle, { recursive: true });
});
afterEach(() => rmSync(tmp, { recursive: true, force: true }));

describe("--export okf nunca escreve na origem", () => {
  test("saída igual ao bundle: recusa, exit != 0, nada muda", () => {
    const before = snapshot(bundle);
    const r = ginga(["lint", bundle, "--export", "okf", bundle]);
    expect(r.code).not.toBe(0);
    expect(snapshot(bundle)).toEqual(before);
  });
  test("saída dentro do bundle: recusa, exit != 0, nada é criado", () => {
    const before = snapshot(bundle);
    const r = ginga(["lint", bundle, "--export", "okf", join(bundle, "out")]);
    expect(r.code).not.toBe(0);
    expect(existsSync(join(bundle, "out"))).toBe(false);
    expect(snapshot(bundle)).toEqual(before);
  });
});

describe("numeração de TASK", () => {
  test("arquivo TASK fora do padrão TASK-NN-slug é erro de lint", () => {
    const plan = join(bundle, "plans", "PLAN-0001-alpha");
    cpSync(join(plan, "TASK-02-second.md"), join(plan, "TASK-foo.md"));
    const r = ginga(["lint", bundle]);
    expect(r.code).toBe(1);
    expect(r.out).toContain("TASK-foo");
  });
});
