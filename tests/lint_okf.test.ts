import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";

const ROOT = join(import.meta.dir, "..");
const OK = join(ROOT, "tests", "fixtures", "bundle-ok");
const BAD = join(ROOT, "tests", "fixtures", "bundle-bad");

function ginga(args: string[], cwd = ROOT) {
  const r = Bun.spawnSync(["bun", join(ROOT, "bin/ginga.ts"), ...args], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });
  return { code: r.exitCode, out: r.stdout.toString(), err: r.stderr.toString() };
}

function walk(dir: string, root: string = dir): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p, root));
    else out.push(relative(root, p));
  }
  return out.sort();
}

function split(text: string): { fm: Record<string, any>; body: string } {
  const m = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) return { fm: {}, body: text };
  return { fm: (Bun.YAML.parse(m[1]!) as Record<string, any>) ?? {}, body: m[2]! };
}

function snapshot(dir: string): Record<string, string> {
  return Object.fromEntries(walk(dir).map((f) => [f, readFileSync(join(dir, f), "utf8")]));
}

let tmp: string;
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "ginga-okf-"));
});
afterEach(() => rmSync(tmp, { recursive: true, force: true }));

describe("ginga lint --export okf", () => {
  test("bundle com erro de lint não exporta nada", () => {
    const out = join(tmp, "out");
    const r = ginga(["lint", BAD, "--export", "okf", out]);
    expect(r.code).toBe(1);
    expect(existsSync(out) ? walk(out) : []).toEqual([]);
  });

  test("exporta os mesmos arquivos do bundle-ok", () => {
    const out = join(tmp, "out");
    const r = ginga(["lint", OK, "--export", "okf", out]);
    expect(r.code).toBe(0);
    expect(walk(out)).toEqual(walk(OK));
  });

  test("todo .md exportado tem type no frontmatter; os que já tinham mantêm o valor", () => {
    const out = join(tmp, "out");
    ginga(["lint", OK, "--export", "okf", out]);
    for (const f of walk(out).filter((x) => x.endsWith(".md"))) {
      const { fm } = split(readFileSync(join(out, f), "utf8"));
      expect(typeof fm.type).toBe("string");
      expect(String(fm.type).length).toBeGreaterThan(0);
    }
    const plan = split(readFileSync(join(out, "plans/PLAN-0001-alpha/PLAN.md"), "utf8"));
    expect(plan.fm.type).toBe("plan");
    const task = split(readFileSync(join(out, "plans/PLAN-0001-alpha/TASK-02-second.md"), "utf8"));
    expect(task.fm.type).toBe("task");
  });

  test("index.md raiz declara okf: \"0.1\"", () => {
    const out = join(tmp, "out");
    ginga(["lint", OK, "--export", "okf", out]);
    const { fm } = split(readFileSync(join(out, "index.md"), "utf8"));
    expect(fm.okf).toBe("0.1");
  });

  test("relações continuam no frontmatter e também viram links markdown", () => {
    const out = join(tmp, "out");
    ginga(["lint", OK, "--export", "okf", out]);
    const read = (f: string) => split(readFileSync(join(out, f), "utf8"));

    const spec = read("specs/SPEC-0001-alpha.md");
    expect(spec.fm.intent).toBe("INTENT-0001-alpha");
    expect(spec.body).toContain("](../intents/INTENT-0001-alpha.md)");

    const plan = read("plans/PLAN-0001-alpha/PLAN.md");
    expect(plan.fm.spec).toBe("SPEC-0001-alpha");
    expect(plan.body).toContain("](../../intents/INTENT-0001-alpha.md)");
    expect(plan.body).toContain("](../../specs/SPEC-0001-alpha.md)");

    const t2 = read("plans/PLAN-0001-alpha/TASK-02-second.md");
    expect(t2.fm.depends_on).toEqual(["TASK-01-first"]);
    expect(t2.body).toContain("](TASK-01-first.md)");
    expect(t2.body).toContain("](PLAN.md)");
  });

  test("corpo original é preservado", () => {
    const out = join(tmp, "out");
    ginga(["lint", OK, "--export", "okf", out]);
    const orig = split(readFileSync(join(OK, "specs/SPEC-0001-alpha.md"), "utf8"));
    const exp = split(readFileSync(join(out, "specs/SPEC-0001-alpha.md"), "utf8"));
    expect(exp.body).toContain(orig.body.trim());
  });

  test("não altera o bundle de origem", () => {
    const src = join(tmp, "src");
    cpSync(OK, src, { recursive: true });
    const antes = snapshot(src);
    ginga(["lint", src, "--export", "okf", join(tmp, "out")]);
    expect(snapshot(src)).toEqual(antes);
  });

  test("sem dir usa .ginga/ do cwd", () => {
    const ws = join(tmp, "ws");
    cpSync(OK, join(ws, ".ginga"), { recursive: true });
    const out = join(tmp, "out");
    const r = ginga(["lint", "--export", "okf", out], ws);
    expect(r.code).toBe(0);
    expect(walk(out)).toEqual(walk(OK));
  });
});
