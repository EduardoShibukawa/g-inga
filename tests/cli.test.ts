import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");

function ginga(...args: string[]) {
  const r = Bun.spawnSync(["bun", "bin/ginga.ts", ...args], {
    cwd: ROOT,
    stdout: "pipe",
    stderr: "pipe",
  });
  return {
    code: r.exitCode,
    out: r.stdout.toString(),
    err: r.stderr.toString(),
  };
}

describe("ginga CLI mínima", () => {
  test("version --json imprime o contrato v1", () => {
    const r = ginga("version", "--json");
    expect(r.code).toBe(0);
    expect(JSON.parse(r.out)).toEqual({
      schema_version: 1,
      name: "ginga",
      version: "0.1.0",
    });
  });

  test("comando desconhecido sai com 2", () => {
    const r = ginga("nao-existe");
    expect(r.code).toBe(2);
  });

  test("package.json declara bin.ginga", () => {
    const pkgPath = join(ROOT, "package.json");
    expect(existsSync(pkgPath)).toBe(true);
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
    expect(pkg.bin?.ginga).toBe("bin/ginga.ts");
  });

  test("README tem a seção Name origin", () => {
    const readmePath = join(ROOT, "README.md");
    expect(existsSync(readmePath)).toBe(true);
    expect(readFileSync(readmePath, "utf8")).toMatch(/^#+\s*Name origin/m);
  });

  test("src/ não importa p-inga/ nem pi-harness/", () => {
    const r = Bun.spawnSync(
      ["grep", "-rEn", "(import|export|require).*(p-inga|pi-harness)", "src", "bin"],
      { cwd: ROOT, stdout: "pipe", stderr: "pipe" },
    );
    expect(r.stdout.toString().trim()).toBe("");
    // existsSync garante que o teste não passa vazio (src/ precisa existir)
    expect(existsSync(join(ROOT, "src", "cli.ts"))).toBe(true);
  });
});
