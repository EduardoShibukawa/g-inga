import { afterAll, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { detectContract, renderProjectToml } from "../src/init";
import { VERBS, runVerb } from "../src/verbs/registry";

/**
 * T917: verbo `detect` — o que o `ginga init` leria do projeto, sem criar
 * nada. Alimenta a tela Onboarding da Roda Web.
 */
const dirs: string[] = [];
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

function fixture(files: Record<string, string> = {}) {
  const repo = mkdtempSync(join(tmpdir(), "ginga-detect-"));
  dirs.push(repo);
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(join(repo, rel, ".."), { recursive: true });
    writeFileSync(join(repo, rel), text);
  }
  return { repo, ctx: { by: "dono", via: "api", root: join(repo, ".ginga"), db: new Database(":memory:") } };
}

describe("verbo detect", () => {
  test("é verbo de leitura sem argumentos", () => {
    const v = VERBS.find((x) => x.name === "detect");
    expect(v).toBeDefined();
    expect(v!.write).toBe(false);
    expect(v!.args).toEqual([]);
  });

  test("devolve o mesmo contrato e o mesmo TOML que o init criaria", async () => {
    const { repo, ctx } = fixture({ "go.mod": "module x\n" });
    const r: any = await runVerb("detect", ctx, {});
    const contract = detectContract(repo);
    expect(r.detected).toEqual({
      test: "go test ./...",
      provider: contract.provider,
      runtimes: contract.runtimes,
      notify: contract.notify,
    });
    expect(r.toml).toBe(renderProjectToml(contract));
    expect(r.bundle).toEqual({ exists: false, project_toml: false });
  });

  test("projeto sem stack conhecida: test null", async () => {
    const r: any = await runVerb("detect", fixture().ctx, {});
    expect(r.detected.test).toBeNull();
  });

  test("avisa quando o .ginga e o project.toml já existem", async () => {
    const { ctx } = fixture({ ".ginga/project.toml": "[commands]\n" });
    const r: any = await runVerb("detect", ctx, {});
    expect(r.bundle).toEqual({ exists: true, project_toml: true });
    const só = fixture({ ".ginga/index.md": "x\n" });
    expect(((await runVerb("detect", só.ctx, {})) as any).bundle).toEqual({ exists: true, project_toml: false });
  });

  test("não cria nada", async () => {
    const { repo, ctx } = fixture({ "package.json": "{}\n" });
    await runVerb("detect", ctx, {});
    expect(existsSync(join(repo, ".ginga"))).toBe(false);
  });
});
