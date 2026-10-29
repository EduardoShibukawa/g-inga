import { describe, expect, test } from "bun:test";
import { mkdtempSync, realpathSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { ensureBinLink } from "../src/install/binlink.ts";

const ROOT = resolve(import.meta.dir, "..");

describe("bin/ginga.ts é executável", () => {
  test("modo 755 no git e no disco", () => {
    const ls = Bun.spawnSync(["git", "ls-files", "-s", "bin/ginga.ts"], { cwd: ROOT, stdout: "pipe" });
    expect(ls.stdout.toString().startsWith("100755")).toBe(true);
    expect(statSync(join(ROOT, "bin", "ginga.ts")).mode & 0o111).not.toBe(0);
  });

  test("o alvo do link criado pelo ensureBinLink executa", () => {
    const home = realpathSync(mkdtempSync(join(realpathSync(tmpdir()), "binx-")));
    try {
      const r = ensureBinLink(home, undefined);
      const st = statSync(r.path); // segue o symlink
      expect(st.mode & 0o111).not.toBe(0);
      const run = Bun.spawnSync([r.path, "--version"], { stdout: "pipe", stderr: "pipe" });
      expect(run.exitCode).toBe(0);
      expect(run.stdout.toString()).toContain("ginga");
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });
});
