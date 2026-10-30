import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkCall, redact } from "../src/guard/core";
import deny from "../src/guard/deny.json";
import cases from "./fixtures/guard/cases.json";

// Chaves falsas montadas em tempo de teste: nenhum literal com formato de chave no repo.
const A = (n: number, ch = "A") => ch.repeat(n);
const FAKES: Record<string, string> = {
  FAKE_NVAPI: "nvapi-" + A(48),
  FAKE_SK: "sk-" + A(48),
  FAKE_GHP: "ghp_" + A(40),
  FAKE_AKIA: "AKIA" + A(16, "B"),
  FAKE_JWT: "eyJ" + A(20) + ".eyJ" + A(20) + "." + A(20),
  FAKE_PEM: "-----BEGIN " + "PRIVATE KEY-----",
};

let root: string, cwd: string, home: string;
const sub = (s: string) => s.replace(/<<(\w+)>>/g, (m, k) => (k === "HOME" ? home : (FAKES[k] ?? m)));
const subIn = (o: unknown): any => JSON.parse(sub(JSON.stringify(o)));

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "guard-"));
  cwd = join(root, "work"); home = join(root, "home");
  mkdirSync(join(cwd, "sub"), { recursive: true });
  mkdirSync(join(home, ".pi/agent"), { recursive: true });
  writeFileSync(join(cwd, ".env"), "FAKE=1\n");
  writeFileSync(join(root, ".env"), "FAKE=1\n");
  writeFileSync(join(home, ".pi/agent/auth.json"), "{}");
  symlinkSync(join(cwd, ".env"), join(cwd, "link-to-env"));
});
afterAll(() => rmSync(root, { recursive: true, force: true }));

describe("checkCall bloqueia", () => {
  for (const c of cases.block) test(c.id, () => {
    const v = checkCall({ tool: c.tool, input: subIn(c.input), cwd, home }, deny as any);
    expect(v.block).toBe(true);
    if (v.block) { expect(v.rule.length).toBeGreaterThan(0); expect(v.reason).not.toContain(FAKES.FAKE_NVAPI); }
  });
});
describe("checkCall deixa passar", () => {
  for (const c of cases.allow) test(c.id, () => {
    expect(checkCall({ tool: c.tool, input: subIn(c.input), cwd, home }, deny as any).block).toBe(false);
  });
});
describe("redact", () => {
  for (const c of cases.redact as any[]) test(c.id, () => {
    const r = redact(sub(c.text), deny as any, c.env_values ?? []);
    if (c.must_not_contain) expect(r.text).not.toContain(sub(c.must_not_contain));
    if (c.must_contain) expect(r.text).toContain(sub(c.must_contain));
  });
});
