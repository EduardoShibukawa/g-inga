import { describe, expect, test } from "bun:test";
import { lstatSync, readlinkSync, rmSync, symlinkSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { installCmd } from "../../src/install";
import { makeRealisticHome } from "./helpers/home";

function cleanup(f: ReturnType<typeof makeRealisticHome>) {
  for (const d of [f.home, f.state, f.tmpdir, f.source]) rmSync(d, { recursive: true, force: true });
}

describe("ginga install --revert: link ~/.local/bin/ginga", () => {
  test("preserva symlink do usuário que aponta para outro alvo", async () => {
    const f = makeRealisticHome();
    try {
      await installCmd({ mode: "apply", home: f.home, adapters: [], env: f.env });
      const link = join(f.home, ".local", "bin", "ginga");
      unlinkSync(link);
      symlinkSync("/usr/bin/true", link);
      const code = await installCmd({ mode: "revert", home: f.home, adapters: [], env: f.env });
      expect(code).toBe(0);
      expect(lstatSync(link).isSymbolicLink()).toBe(true);
      expect(readlinkSync(link)).toBe("/usr/bin/true");
    } finally {
      cleanup(f);
    }
  });

  test("remove o link que o apply criou", async () => {
    const f = makeRealisticHome();
    try {
      await installCmd({ mode: "apply", home: f.home, adapters: [], env: f.env });
      const link = join(f.home, ".local", "bin", "ginga");
      expect(lstatSync(link).isSymbolicLink()).toBe(true);
      const code = await installCmd({ mode: "revert", home: f.home, adapters: [], env: f.env });
      expect(code).toBe(0);
      expect(() => lstatSync(link)).toThrow();
    } finally {
      cleanup(f);
    }
  });
});
