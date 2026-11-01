// PLAN-0013 TASK-02 (T141): LEARNINGS.md no lint + kind no PLAN — testes congelados.
// Codificam o "Fazer" + a "Interface" da TASK:
// - `lintLearnings(path): LintIssue[]` em `src/lint/learnings.ts`: entrada
//   `## L-NN · <confirmada|descartada|fato|armadilha> · AAAA-MM-DD HH:MM` com
//   `hipótese`, `evidência`, `conclusão`, `escopo`. Fixture válida → 0 issues;
//   sem `evidência` → 1 erro; status fora da lista → 1 erro.
// - `ginga lint`: PLAN approved sem `LEARNINGS.md` → AVISO (exit 0, mensagem
//   menciona LEARNINGS.md); draft → nada sobre LEARNINGS.md.
// - frontmatter do PLAN: `kind: investigation` aceito; `kind` fora de
//   change|investigation → erro (field "kind").
// Import dinâmico: sem o módulo, a prova falha por asserção (não por import).

import { afterEach, describe, expect, test } from "bun:test";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { lintBundle } from "../src/lint/index";

const ROOT = join(import.meta.dir, "..");
const FIXTURE = join(ROOT, "tests", "fixtures", "bundle-ok");
const dirs: string[] = [];

afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function tmpDir(prefix: string): string {
  const D = realpathSync(mkdtempSync(join(realpathSync(tmpdir()), prefix)));
  dirs.push(D);
  return D;
}

/** Cópia do bundle-ok com `kind`/`status` do PLAN-0001-alpha alterados e sem LEARNINGS.md. */
function bundleWith(o: { kind?: string; status?: string }): string {
  const D = tmpDir("lint-learn-");
  const dst = join(D, "bundle");
  cpSync(FIXTURE, dst, { recursive: true });
  const plan = join(dst, "plans", "PLAN-0001-alpha", "PLAN.md");
  let raw = readFileSync(plan, "utf8");
  if (o.kind) raw = raw.replace(/^kind:.*$/m, `kind: ${o.kind}`);
  if (o.status) raw = raw.replace(/^status:.*$/m, `status: ${o.status}`);
  writeFileSync(plan, raw);
  return dst;
}

const learnings = await import("../src/lint/learnings.ts").catch(() => null);

const VALID = [
  "# Learnings — PLAN-0001",
  "",
  "## L-01 · confirmada · 2026-10-29 12:00",
  "- hipótese: o bug vinha do cache",
  "- evidência: suíte verde com cache off",
  "- conclusão: invalidar o cache ao trocar o formato",
  "- escopo: src/events/",
  "",
].join("\n");

describe("lintLearnings", () => {
  test("módulo existe e exporta lintLearnings", () => {
    expect(learnings).not.toBeNull();
    expect(typeof (learnings as any)?.lintLearnings).toBe("function");
  });

  test("fixture válida → 0 issues", () => {
    if (!learnings) throw new Error("src/lint/learnings.ts não existe ainda (RED)");
    const f = join(tmpDir("lk-ok-"), "LEARNINGS.md");
    writeFileSync(f, VALID);
    expect((learnings as any).lintLearnings(f)).toEqual([]);
  });

  test("entrada sem `evidência` → 1 erro", () => {
    if (!learnings) throw new Error("src/lint/learnings.ts não existe ainda (RED)");
    const f = join(tmpDir("lk-nol-"), "LEARNINGS.md");
    writeFileSync(f, VALID.replace(/- evidência: .*\n/, ""));
    const issues = (learnings as any).lintLearnings(f) as unknown[];
    expect(issues.length).toBe(1);
  });

  test("status fora de confirmada|descartada|fato|armadilha → 1 erro", () => {
    if (!learnings) throw new Error("src/lint/learnings.ts não existe ainda (RED)");
    const f = join(tmpDir("lk-badst-"), "LEARNINGS.md");
    writeFileSync(f, VALID.replace("· confirmada ·", "· talvez ·"));
    const issues = (learnings as any).lintLearnings(f) as unknown[];
    expect(issues.length).toBe(1);
  });
});

describe("kind do PLAN no lint", () => {
  test("kind: investigation é aceito (sem erro no field kind)", () => {
    const r = lintBundle(bundleWith({ kind: "investigation" }));
    expect(r.errors.filter((e) => e.field === "kind")).toEqual([]);
  });

  test("kind fora de change|investigation → erro no field kind", () => {
    const r = lintBundle(bundleWith({ kind: "deployment" }));
    expect(r.errors.some((e) => e.field === "kind")).toBe(true);
  });
});

describe("LEARNINGS.md exigido no approved (aviso, não erro)", () => {
  test("ginga lint: approved sem LEARNINGS.md → exit 0 e aviso mencionando LEARNINGS.md", () => {
    const D = bundleWith({ status: "approved" });
    const r = Bun.spawnSync([process.execPath, join(ROOT, "bin/ginga.ts"), "lint", D], { stdout: "pipe", stderr: "pipe" });
    expect(r.exitCode).toBe(0);
    expect(r.stdout.toString() + r.stderr.toString()).toContain("LEARNINGS.md");
  });

  test("ginga lint: approved com LEARNINGS.md válido → nada sobre LEARNINGS.md no resultado", () => {
    const D = bundleWith({ status: "approved" });
    writeFileSync(join(D, "plans", "PLAN-0001-alpha", "LEARNINGS.md"), VALID);
    const r = Bun.spawnSync([process.execPath, join(ROOT, "bin/ginga.ts"), "lint", D], { stdout: "pipe", stderr: "pipe" });
    expect(r.exitCode).toBe(0);
    expect(r.stdout.toString() + r.stderr.toString()).not.toContain("LEARNINGS.md");
  });

  test("draft sem LEARNINGS.md → nada sobre LEARNINGS.md (não exige)", () => {
    const D = bundleWith({ status: "draft" });
    const r = Bun.spawnSync([process.execPath, join(ROOT, "bin/ginga.ts"), "lint", D], { stdout: "pipe", stderr: "pipe" });
    expect(r.exitCode).toBe(0);
    expect(r.stdout.toString() + r.stderr.toString()).not.toContain("LEARNINGS.md");
  });
});
