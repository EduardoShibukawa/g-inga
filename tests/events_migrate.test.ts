import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");
const FIXTURE = join(ROOT, "tests", "fixtures", "pi-harness-events.jsonl");

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "ginga-migrate-"));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

function migrate(input: string, out: string) {
  const r = Bun.spawnSync(
    ["bun", "bin/ginga.ts", "events", "migrate", input, "--out", out],
    { cwd: ROOT, stdout: "pipe", stderr: "pipe" },
  );
  return { code: r.exitCode, out: r.stdout.toString(), err: r.stderr.toString() };
}

function lines(path: string): Record<string, any>[] {
  return (existsSync(path) ? readFileSync(path, "utf8") : "")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}

describe("ginga events migrate", () => {
  test("attempt: renomeia campos e preserva passed/failure", () => {
    const out = join(dir, "v1.jsonl");
    const r = migrate(FIXTURE, out);
    expect(r.code).toBe(0);
    const evs = lines(out);
    const attempts = evs.filter((e) => e.kind === "attempt");
    expect(attempts.length).toBe(3);
    const a = attempts[0]!;
    expect(a.v).toBe(1);
    expect(a.source).toBe("pi-harness");
    expect(a.ts).toBe("2026-10-22T19:11:29.371Z");
    expect(typeof a.id).toBe("string");
    expect(a.id.length).toBeGreaterThanOrEqual(16);
    expect(a.spec).toBe("SPEC-0043");
    expect(a.task).toBe("task-0043-5");
    expect(a.data.runtime).toBe("opencode");
    expect(a.data.provider).toBe("opencode");
    expect(a.data.model).toBe("nemotron-3-ultra-free");
    expect(a.data.tier).toBe("free");
    expect(a.data.passed).toBe(false);
    expect(a.data.failure).toBe("quota_exhausted");
    expect(a.data.duration_ms).toBe(240082);
    expect(a.data.tokens_total).toBe(161450);
    expect(a.data.cost_usd).toBe(0);
    expect(a.data.cost_source).toBe("free");
    // campos do formato antigo não vazam para data
    expect(a.data.durationMs).toBeUndefined();
    expect(a.data.costUsd).toBeUndefined();
    // attempt sem tokens/custo não inventa valores
    const manual = attempts[2]!;
    expect(manual.data.passed).toBe(true);
    expect(manual.data.tokens_total).toBeUndefined();
    expect(manual.data.cost_source).toBe("unknown");
  });

  test("verify (BDD) vira receipt com check bdd; status pass só se failed == 0", () => {
    const out = join(dir, "v1.jsonl");
    migrate(FIXTURE, out);
    const receipts = lines(out).filter((e) => e.kind === "receipt");
    expect(receipts.length).toBe(3);
    expect(receipts.every((e) => e.data.check === "bdd" && e.v === 1)).toBe(true);
    expect(receipts.map((e) => e.data.status)).toEqual(["pass", "pass", "fail"]);
    expect(receipts[0]!.spec).toBe("SPEC-0018");
  });

  test("linhas inválidas são contadas e não abortam", () => {
    const out = join(dir, "v1.jsonl");
    const r = migrate(FIXTURE, out);
    expect(r.code).toBe(0);
    expect(lines(out).length).toBe(6);
    expect(r.out + r.err).toMatch(/invalid\D*1|1\D*inv[aá]lid/i);
  });

  test("é idempotente (ids determinísticos) e não reescreve a entrada", () => {
    const antes = readFileSync(FIXTURE, "utf8");
    const a = join(dir, "a.jsonl");
    const b = join(dir, "b.jsonl");
    migrate(FIXTURE, a);
    migrate(FIXTURE, b);
    expect(readFileSync(a, "utf8")).toBe(readFileSync(b, "utf8"));
    expect(readFileSync(FIXTURE, "utf8")).toBe(antes);
  });

  test("a saída passa em ginga events validate", () => {
    const out = join(dir, "v1.jsonl");
    migrate(FIXTURE, out);
    const v = Bun.spawnSync(["bun", "bin/ginga.ts", "events", "validate", out], {
      cwd: ROOT,
      stdout: "pipe",
      stderr: "pipe",
    });
    expect(v.exitCode).toBe(0);
  });

  test("entrada vazia gera saída vazia e exit 0", () => {
    const inp = join(dir, "vazio.jsonl");
    writeFileSync(inp, "");
    const out = join(dir, "v1.jsonl");
    const r = migrate(inp, out);
    expect(r.code).toBe(0);
    expect(readFileSync(out, "utf8")).toBe("");
  });
});
