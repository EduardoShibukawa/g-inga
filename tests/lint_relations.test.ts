import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const ROOT = join(import.meta.dir, "..");

type LintErr = { file: string; field: string; message: string };

function lintJson(dir: string): { code: number; errors: LintErr[] } {
  const r = Bun.spawnSync(["bun", join(ROOT, "bin/ginga.ts"), "lint", dir, "--json"], {
    cwd: ROOT,
    stdout: "pipe",
    stderr: "pipe",
  });
  let errors: LintErr[] = [];
  try {
    errors = JSON.parse(r.stdout.toString()).errors ?? [];
  } catch {}
  return { code: r.exitCode, errors };
}

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "ginga-rel-"));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

function put(rel: string, text: string) {
  const p = join(root, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, text);
}

const intent = (n = "0001-a") =>
  put(`intents/INTENT-${n}.md`, "---\ntype: intent\ntitle: t\nsource: cli\ntimestamp: 2026-10-27T00:00:00Z\n---\n");
const spec = (n = "0001-a", i = "INTENT-0001-a") =>
  put(`specs/SPEC-${n}.md`, `---\ntype: spec\ntitle: t\nintent: ${i}\nstatus: draft\nbench: none\n---\n`);
const plan = (n = "0001-a", extra = "spec: SPEC-0001-a\nintent: INTENT-0001-a") =>
  put(`plans/PLAN-${n}/PLAN.md`, `---\ntype: plan\ntitle: t\n${extra}\nstatus: draft\ndone_when: "bun test"\n---\n`);
function task(
  name: string,
  o: { plan?: string; folder?: string; deps?: string[]; touch?: string[] } = {},
) {
  const folder = o.folder ?? "PLAN-0001-a";
  put(
    `plans/${folder}/${name}.md`,
    `---\ntype: task\nmode: mvp\ngoal: g\nplan: ${o.plan ?? folder}\n` +
      `depends_on: [${(o.deps ?? []).join(", ")}]\ntouch: [${(o.touch ?? [`src/${name}.ts`]).join(", ")}]\n` +
      `done_when: "bun test"\n---\n`,
  );
}
function base() {
  intent();
  spec();
  plan();
}
const fields = (errs: LintErr[]) => errs.map((e) => e.field);

describe("referências", () => {
  test("cadeia válida passa", () => {
    base();
    task("TASK-01-a");
    task("TASK-02-b", { deps: ["TASK-01-a"] });
    const r = lintJson(root);
    expect(r.errors).toEqual([]);
    expect(r.code).toBe(0);
  });

  test("spec.intent inexistente", () => {
    intent();
    spec("0001-a", "INTENT-0009-nope");
    plan();
    task("TASK-01-a");
    const r = lintJson(root);
    expect(r.code).toBe(1);
    expect(r.errors.some((e) => e.file === "specs/SPEC-0001-a.md" && e.field === "intent")).toBe(true);
  });

  test("plan.spec e plan.intent inexistentes", () => {
    intent();
    spec();
    plan("0001-a", "spec: SPEC-0009-nope\nintent: INTENT-0009-nope");
    task("TASK-01-a");
    const r = lintJson(root);
    const doPlan = r.errors.filter((e) => e.file === "plans/PLAN-0001-a/PLAN.md").map((e) => e.field);
    expect(doPlan).toContain("spec");
    expect(doPlan).toContain("intent");
  });

  test("plan sem spec (trilha pequena) é válido", () => {
    intent();
    plan("0001-a", "intent: INTENT-0001-a");
    task("TASK-01-a");
    expect(lintJson(root).code).toBe(0);
  });

  test("TASK.plan diferente da pasta onde ela está", () => {
    base();
    task("TASK-01-a", { plan: "PLAN-0007-outro" });
    const r = lintJson(root);
    expect(r.code).toBe(1);
    expect(r.errors.some((e) => e.file === "plans/PLAN-0001-a/TASK-01-a.md" && e.field === "plan")).toBe(true);
  });

  test("depends_on para TASK inexistente", () => {
    base();
    task("TASK-01-a", { deps: ["TASK-09-fantasma"] });
    const r = lintJson(root);
    expect(r.code).toBe(1);
    expect(fields(r.errors)).toContain("depends_on");
  });

  test("PLAN sem nenhuma TASK", () => {
    base();
    const r = lintJson(root);
    expect(r.code).toBe(1);
    expect(r.errors.some((e) => e.file === "plans/PLAN-0001-a/PLAN.md")).toBe(true);
  });
});

describe("numeração única", () => {
  test("dois INTENT com o mesmo número", () => {
    base();
    intent("0001-b");
    task("TASK-01-a");
    const r = lintJson(root);
    expect(r.code).toBe(1);
    expect(r.errors.some((e) => e.file.startsWith("intents/INTENT-0001-"))).toBe(true);
  });

  test("dois PLAN com o mesmo número", () => {
    base();
    task("TASK-01-a");
    plan("0001-b", "intent: INTENT-0001-a");
    task("TASK-01-a", { folder: "PLAN-0001-b" });
    const r = lintJson(root);
    expect(r.code).toBe(1);
    expect(r.errors.some((e) => e.file.startsWith("plans/PLAN-0001-"))).toBe(true);
  });

  test("duas TASKs com o mesmo número dentro do PLAN", () => {
    base();
    task("TASK-01-a");
    task("TASK-01-b");
    const r = lintJson(root);
    expect(r.code).toBe(1);
    expect(r.errors.some((e) => e.file.startsWith("plans/PLAN-0001-a/TASK-01-"))).toBe(true);
  });

  test("TASK-01 em PLANs diferentes não conflita", () => {
    base();
    task("TASK-01-a");
    plan("0002-b", "intent: INTENT-0001-a");
    task("TASK-01-a", { folder: "PLAN-0002-b" });
    expect(lintJson(root).code).toBe(0);
  });
});

describe("DAG", () => {
  test("ciclo de depends_on", () => {
    base();
    task("TASK-01-a", { deps: ["TASK-02-b"] });
    task("TASK-02-b", { deps: ["TASK-01-a"] });
    const r = lintJson(root);
    expect(r.code).toBe(1);
    const e = r.errors.find((x) => x.field === "depends_on" && /cicl|cycle/i.test(x.message));
    expect(e).toBeDefined();
    expect(e!.message).toContain("TASK-01-a");
    expect(e!.message).toContain("TASK-02-b");
  });

  test("depends_on de uma TASK nela mesma é ciclo", () => {
    base();
    task("TASK-01-a", { deps: ["TASK-01-a"] });
    const r = lintJson(root);
    expect(r.code).toBe(1);
    expect(fields(r.errors)).toContain("depends_on");
  });
});

describe("touch disjunto entre TASKs paralelas", () => {
  test("mesmo arquivo em duas TASKs sem caminho entre si", () => {
    base();
    task("TASK-01-a", { touch: ["src/x.ts"] });
    task("TASK-02-b", { touch: ["src/x.ts"] });
    const r = lintJson(root);
    expect(r.code).toBe(1);
    expect(r.errors.some((e) => e.field === "touch" && e.message.includes("src/x.ts"))).toBe(true);
  });

  test("prefixo de pasta conta como conflito", () => {
    base();
    task("TASK-01-a", { touch: ["src/lint/"] });
    task("TASK-02-b", { touch: ["src/lint/dag.ts"] });
    const r = lintJson(root);
    expect(r.code).toBe(1);
    expect(fields(r.errors)).toContain("touch");
  });

  test("pasta com nome parecido não é prefixo (src/lint vs src/linter.ts)", () => {
    base();
    task("TASK-01-a", { touch: ["src/lint/"] });
    task("TASK-02-b", { touch: ["src/linter.ts"] });
    expect(lintJson(root).code).toBe(0);
  });

  test("mesmo touch com depends_on direto entre elas é permitido", () => {
    base();
    task("TASK-01-a", { touch: ["src/x.ts"] });
    task("TASK-02-b", { touch: ["src/x.ts"], deps: ["TASK-01-a"] });
    expect(lintJson(root).code).toBe(0);
  });

  test("caminho transitivo também serializa (3 → 2 → 1)", () => {
    base();
    task("TASK-01-a", { touch: ["src/x.ts"] });
    task("TASK-02-b", { touch: ["src/y.ts"], deps: ["TASK-01-a"] });
    task("TASK-03-c", { touch: ["src/x.ts"], deps: ["TASK-02-b"] });
    expect(lintJson(root).code).toBe(0);
  });

  test("touch disjunto em paralelo passa", () => {
    base();
    task("TASK-01-a", { touch: ["src/a.ts"] });
    task("TASK-02-b", { touch: ["src/b.ts"] });
    expect(lintJson(root).code).toBe(0);
  });

  test("TASKs de PLANs diferentes não são comparadas", () => {
    base();
    task("TASK-01-a", { touch: ["src/x.ts"] });
    plan("0002-b", "intent: INTENT-0001-a");
    task("TASK-01-a", { folder: "PLAN-0002-b", touch: ["src/x.ts"] });
    expect(lintJson(root).code).toBe(0);
  });
});
