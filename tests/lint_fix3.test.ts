import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { cpSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Judge rodada 3 (Codex): data de calendário impossível e TASK-*.md sem `type: task`.
const ROOT = join(import.meta.dir, "..");
const OK = join(ROOT, "tests", "fixtures", "bundle-ok");
type Val = { validateEvent: (ev: unknown) => { ok: boolean; errors: string[] } };
const load = async () => (await import(join(ROOT, "src/events/validate.ts"))) as Val;
const env = (ts: string) => ({
  v: 1, ts, source: "pinga", kind: "receipt", id: "01JBX0000000000000000000AA",
  data: { ledger_n: 3, hash: "a".repeat(64), status: "pass", check: "verify" },
});
function ginga(args: string[]) {
  const r = Bun.spawnSync(["bun", join(ROOT, "bin/ginga.ts"), ...args], { cwd: ROOT, stdout: "pipe", stderr: "pipe" });
  return { code: r.exitCode, out: r.stdout.toString() + r.stderr.toString() };
}

describe("ts: data de calendário real", () => {
  for (const ts of ["2026-02-30T00:00:00Z", "2026-02-29T00:00:00Z", "2026-13-01T00:00:00Z", "2026-04-31T10:00:00.000Z", "2026-10-27T24:00:00Z", "2026-10-27T12:60:00Z"]) {
    test(`reprova ${ts}`, async () => {
      expect((await load()).validateEvent(env(ts)).ok).toBe(false);
    });
  }
  for (const ts of ["2024-02-29T23:59:59Z", "2026-12-31T23:59:59.999Z", "2026-10-27T14:02:11.204Z"]) {
    test(`aceita ${ts}`, async () => {
      expect((await load()).validateEvent(env(ts)).ok).toBe(true);
    });
  }
});

describe("TASK-*.md fora do padrão é erro mesmo sem `type: task`", () => {
  let tmp: string;
  let plan: string;
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "ginga-fix3-"));
    cpSync(OK, join(tmp, "b"), { recursive: true });
    plan = join(tmp, "b", "plans", "PLAN-0001-alpha");
  });
  afterEach(() => rmSync(tmp, { recursive: true, force: true }));

  const cases: Record<string, string> = {
    "sem type": "---\ntitle: x\nplan: PLAN-0001-alpha\n---\ncorpo\n",
    "type desconhecido": "---\ntype: tarefa\ntitle: x\n---\ncorpo\n",
    "sem frontmatter": "só texto\n",
  };
  for (const [name, body] of Object.entries(cases)) {
    test(name, () => {
      writeFileSync(join(plan, "TASK-foo.md"), body);
      const r = ginga(["lint", join(tmp, "b")]);
      expect(r.code).not.toBe(0);
      expect(r.out).toContain("TASK-foo");
    });
  }
  test("bundle-ok continua limpo", () => {
    expect(ginga(["lint", join(tmp, "b")]).code).toBe(0);
  });
});
