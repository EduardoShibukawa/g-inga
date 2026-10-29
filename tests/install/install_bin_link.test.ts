import { describe, expect, test } from "bun:test";
import { existsSync, lstatSync, readlinkSync, realpathSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { installCmd } from "../../src/install";
import { makeRealisticHome } from "./helpers/home";

const ENTRY = resolve(import.meta.dir, "../../bin/ginga.ts");

function cleanup(f: ReturnType<typeof makeRealisticHome>) {
  for (const d of [f.home, f.state, f.tmpdir, f.source]) rmSync(d, { recursive: true, force: true });
}

describe("ginga install: link ~/.local/bin/ginga", () => {
  test("cria o link para o entrypoint e `ginga --version` roda por ele", async () => {
    const f = makeRealisticHome();
    try {
      const code = await installCmd({ mode: "apply", home: f.home, adapters: [], env: f.env });
      expect(code).toBe(0);
      const link = join(f.home, ".local", "bin", "ginga");
      expect(lstatSync(link).isSymbolicLink()).toBe(true);
      expect(realpathSync(link)).toBe(realpathSync(ENTRY));
      const p = Bun.spawnSync([process.execPath, link, "--version"], { env: { ...process.env, HOME: f.home } });
      expect(p.exitCode).toBe(0);
      expect(p.stdout.toString()).toContain("ginga");
    } finally {
      cleanup(f);
    }
  });

  test("idempotente: segunda execução mantém o mesmo link", async () => {
    const f = makeRealisticHome();
    try {
      await installCmd({ mode: "apply", home: f.home, adapters: [], env: f.env });
      const link = join(f.home, ".local", "bin", "ginga");
      const first = readlinkSync(link);
      const code = await installCmd({ mode: "apply", home: f.home, adapters: [], env: f.env });
      expect(code).toBe(0);
      expect(readlinkSync(link)).toBe(first);
    } finally {
      cleanup(f);
    }
  });

  test("avisa quando ~/.local/bin não está no PATH", async () => {
    const f = makeRealisticHome();
    const errs: string[] = [];
    const orig = console.error;
    console.error = (...a: unknown[]) => void errs.push(a.join(" "));
    try {
      await installCmd({ mode: "apply", home: f.home, adapters: [], env: { ...f.env, PATH: "/usr/bin" } });
      expect(errs.join("\n")).toContain("não está no PATH");
    } finally {
      console.error = orig;
      cleanup(f);
    }
  });

  test("não sobrescreve arquivo regular existente", async () => {
    const f = makeRealisticHome();
    try {
      const link = join(f.home, ".local", "bin", "ginga");
      await Bun.write(link, "#!/bin/sh\necho meu\n");
      await installCmd({ mode: "apply", home: f.home, adapters: [], env: f.env });
      expect(lstatSync(link).isSymbolicLink()).toBe(false);
      expect(existsSync(dirname(link))).toBe(true);
    } finally {
      cleanup(f);
    }
  });
});
