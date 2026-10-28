import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const ROOT = join(import.meta.dir, "..");
const OK = join(ROOT, "tests", "fixtures", "bundle-ok");
const BAD = join(ROOT, "tests", "fixtures", "bundle-bad");

type LintErr = { file: string; field: string; message: string };

function lint(args: string[], cwd = ROOT) {
  const r = Bun.spawnSync(["bun", join(ROOT, "bin/ginga.ts"), "lint", ...args], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });
  return { code: r.exitCode, out: r.stdout.toString(), err: r.stderr.toString() };
}

function lintJson(dir: string): { code: number; errors: LintErr[] } {
  const r = lint([dir, "--json"]);
  let parsed: { errors?: LintErr[] } = {};
  try {
    parsed = JSON.parse(r.out);
  } catch {}
  return { code: r.code, errors: parsed.errors ?? [] };
}

let tmp: string;
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "ginga-lint-"));
});
afterEach(() => rmSync(tmp, { recursive: true, force: true }));

function put(root: string, rel: string, text: string) {
  const p = join(root, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, text);
}

describe("ginga lint: bundle válido", () => {
  test("bundle-ok sai com 0 e sem erros", () => {
    const r = lintJson(OK);
    expect(r.code).toBe(0);
    expect(r.errors).toEqual([]);
  });

  test("sem argumento lê .ginga/ do cwd", () => {
    cpSync(OK, join(tmp, ".ginga"), { recursive: true });
    const r = lint([], tmp);
    expect(r.code).toBe(0);
  });
});

describe("ginga lint: bundle-bad", () => {
  test("sai com 1 e lista arquivo: campo: mensagem", () => {
    const r = lint([BAD]);
    expect(r.code).toBe(1);
    const lines = (r.out + r.err).split("\n");
    const has = (re: RegExp) => lines.some((l) => re.test(l));
    expect(has(/^intents\/INTENT-0001-bad\.md: source: \S/)).toBe(true);
    expect(has(/^specs\/SPEC-0001-bad\.md: status: \S/)).toBe(true);
    expect(has(/^plans\/PLAN-0001-bad\/PLAN\.md: kind: \S/)).toBe(true);
    expect(has(/^plans\/PLAN-0001-bad\/TASK-01-x\.md: done_when: \S/)).toBe(true);
    expect(has(/^plans\/PLAN-0001-bad\/TASK-01-x\.md: mode: \S/)).toBe(true);
  });

  test("--json devolve ok:false e errors com file, field e message", () => {
    const r = lint([BAD, "--json"]);
    expect(r.code).toBe(1);
    const j = JSON.parse(r.out);
    expect(j.ok).toBe(false);
    const e = j.errors as LintErr[];
    expect(e.length).toBeGreaterThanOrEqual(5);
    expect(
      e.some((x) => x.file === "specs/SPEC-0001-bad.md" && x.field === "status"),
    ).toBe(true);
    expect(e.every((x) => typeof x.message === "string" && x.message !== "")).toBe(true);
  });
});

describe("ginga lint: obrigatórios por tipo", () => {
  const docs: Record<string, { path: string; fm: Record<string, string> }> = {
    intent: {
      path: "intents/INTENT-0001-a.md",
      fm: { type: "intent", title: "t", source: "cli", timestamp: "2026-10-27T14:00:00Z" },
    },
    spec: {
      path: "specs/SPEC-0001-a.md",
      fm: { type: "spec", title: "t", intent: "INTENT-0001-a", status: "draft", bench: "none" },
    },
    plan: {
      path: "plans/PLAN-0001-a/PLAN.md",
      fm: { type: "plan", title: "t", intent: "INTENT-0001-a", status: "draft", done_when: '"bun test"' },
    },
    task: {
      path: "plans/PLAN-0001-a/TASK-01-a.md",
      fm: {
        type: "task",
        mode: "mvp",
        goal: '"g"',
        done_when: '"bun test"',
        touch: "[src/a.ts]",
        plan: "PLAN-0001-a",
      },
    },
  };
  const required: Record<string, string[]> = {
    intent: ["title", "source", "timestamp"],
    spec: ["title", "intent", "status", "bench"],
    plan: ["title", "intent", "status"],
    task: ["mode", "goal", "done_when", "touch", "plan"],
  };

  function bundle(omit?: { type: string; field: string }) {
    const root = mkdtempSync(join(tmp, "b-"));
    for (const [type, d] of Object.entries(docs)) {
      const fm = { ...d.fm };
      if (omit && omit.type === type) delete fm[omit.field];
      const yaml = Object.entries(fm).map(([k, v]) => `${k}: ${v}`).join("\n");
      put(root, d.path, `---\n${yaml}\n---\ncorpo\n`);
    }
    return root;
  }

  test("o conjunto completo mínimo passa", () => {
    const r = lintJson(bundle());
    expect(r.errors).toEqual([]);
    expect(r.code).toBe(0);
  });

  for (const [type, fields] of Object.entries(required)) {
    for (const field of fields) {
      test(`${type} sem ${field} é erro em ${field}`, () => {
        const r = lintJson(bundle({ type, field }));
        expect(r.code).toBe(1);
        expect(
          r.errors.some((e) => e.field === field && e.file === docs[type]!.path),
        ).toBe(true);
      });
    }
  }
});

describe("ginga lint: valores aceitos", () => {
  function one(path: string, fm: string) {
    const root = mkdtempSync(join(tmp, "v-"));
    put(root, path, `---\n${fm}\n---\n`);
    return lintJson(root);
  }

  test("status de spec: draft|blocked|approved|superseded", () => {
    for (const s of ["draft", "blocked", "approved", "superseded"]) {
      const r = one("specs/SPEC-0001-a.md", `type: spec\ntitle: t\nintent: INTENT-0001-a\nstatus: ${s}\nbench: none`);
      expect(r.errors.some((e) => e.field === "status")).toBe(false);
    }
    const bad = one("specs/SPEC-0001-a.md", "type: spec\ntitle: t\nintent: INTENT-0001-a\nstatus: executing\nbench: none");
    expect(bad.errors.some((e) => e.field === "status")).toBe(true);
  });

  test("status de plan: draft|approved|superseded (blocked não vale)", () => {
    const f = (s: string) =>
      one("plans/PLAN-0001-a/PLAN.md", `type: plan\ntitle: t\nintent: INTENT-0001-a\nstatus: ${s}`);
    expect(f("approved").errors.some((e) => e.field === "status")).toBe(false);
    expect(f("blocked").errors.some((e) => e.field === "status")).toBe(true);
  });

  test("kind de plan: change|investigation", () => {
    const f = (k: string) =>
      one("plans/PLAN-0001-a/PLAN.md", `type: plan\ntitle: t\nintent: INTENT-0001-a\nstatus: draft\nkind: ${k}`);
    expect(f("change").errors.some((e) => e.field === "kind")).toBe(false);
    expect(f("investigation").errors.some((e) => e.field === "kind")).toBe(false);
    expect(f("outro").errors.some((e) => e.field === "kind")).toBe(true);
  });

  test("mode de task: mvp|padrao|completo (full não vale)", () => {
    const f = (m: string) =>
      one(
        "plans/PLAN-0001-a/TASK-01-a.md",
        `type: task\nmode: ${m}\ngoal: g\ndone_when: x\ntouch: [a]\nplan: PLAN-0001-a`,
      );
    for (const m of ["mvp", "padrao", "completo"]) {
      expect(f(m).errors.some((e) => e.field === "mode")).toBe(false);
    }
    expect(f("full").errors.some((e) => e.field === "mode")).toBe(true);
  });

  test("campos extras (ex.: approved:) são aceitos", () => {
    const r = one(
      "specs/SPEC-0001-a.md",
      "type: spec\ntitle: t\nintent: INTENT-0001-a\nstatus: approved\napproved: 2026-10-27\nbench: none",
    );
    // relações (intent apontando para arquivo ausente) são da TASK-06
    const campos = ["type", "title", "status", "bench"];
    expect(r.errors.filter((e) => campos.includes(e.field))).toEqual([]);
  });

  test("frontmatter ausente ou YAML quebrado é erro, não crash", () => {
    const root = mkdtempSync(join(tmp, "x-"));
    put(root, "intents/INTENT-0001-a.md", "sem frontmatter\n");
    put(root, "intents/INTENT-0002-b.md", "---\ntitle: [quebrado\n---\n");
    const r = lint([root, "--json"]);
    expect(r.code).toBe(1);
    const files = (JSON.parse(r.out).errors as LintErr[]).map((e) => e.file);
    expect(files).toContain("intents/INTENT-0001-a.md");
    expect(files).toContain("intents/INTENT-0002-b.md");
  });
});
