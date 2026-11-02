import { describe, expect, test } from "bun:test";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..", "..");
const FIXTURES = [
  "tests/fixtures/code-mode/snapshot/runs/a.log",
  "tests/fixtures/code-mode/snapshot/runs/b.log",
  "tests/fixtures/code-mode/snapshot/runs/c.jsonl",
  "tests/fixtures/code-mode/snapshot/runs/d.jsonl",
];

describe("PLAN-0016 TASK-07: snapshot sintético em checkout limpo", () => {
  test("o índice contém runs/ e Oracle + superfície M passam na cópia exportada", () => {
    const tracked = execFileSync("git", ["ls-files"], {
      cwd: ROOT,
      encoding: "utf8",
    })
      .trim()
      .split("\n");
    for (const fixture of FIXTURES) expect(tracked).toContain(fixture);

    const exportDir = mkdtempSync(join(tmpdir(), "ginga-code-mode-index-"));
    try {
      execFileSync(
        "git",
        ["checkout-index", "--all", `--prefix=${exportDir}${"/"}`],
        { cwd: ROOT, stdio: "pipe" },
      );
      const result = spawnSync(
        process.execPath,
        ["test", "tests/code_mode/oracle.test.ts", "tests/code_mode/surface_m.test.ts"],
        { cwd: exportDir, encoding: "utf8" },
      );
      expect(result.status).toBe(0);
      expect(`${result.stdout}\n${result.stderr}`).toContain("0 fail");
    } finally {
      rmSync(exportDir, { recursive: true, force: true });
    }
  });
});
