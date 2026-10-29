import { describe, expect, test } from "bun:test";
import { existsSync, lstatSync, mkdtempSync, readdirSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { installSupervisorCmd } from "../../src/install/supervisor_unit.ts";

const ROOT = resolve(import.meta.dir, "../..");

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

function mkhome() {
  return realpathSync(mkdtempSync(join(realpathSync(tmpdir()), "supflag-")));
}

describe("ginga install --supervisor [--enable]", () => {
  test("HOME temporário: só unit e link; nenhum arquivo de adaptador tocado", async () => {
    const home = mkhome();
    const calls: string[][] = [];
    try {
      const code = await installSupervisorCmd({
        home,
        env: { PATH: "/usr/bin" },
        enable: false,
        systemctl: async (args: string[]) => { calls.push(args); return 0; },
      });
      expect(code).toBe(0);
      expect(existsSync(join(home, ".config", "systemd", "user", "ginga-supervisor.service"))).toBe(true);
      expect(lstatSync(join(home, ".local", "bin", "ginga")).isSymbolicLink()).toBe(true);
      const files = walk(home).map((p) => relative(home, p)).sort();
      expect(files).toEqual([".config/systemd/user/ginga-supervisor.service", ".local/bin/ginga"]);
      expect(calls).toEqual([["--user", "daemon-reload"]]);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  test("--enable: daemon-reload e enable --now", async () => {
    const home = mkhome();
    const calls: string[][] = [];
    try {
      const code = await installSupervisorCmd({
        home,
        env: { PATH: "/usr/bin" },
        enable: true,
        systemctl: async (args: string[]) => { calls.push(args); return 0; },
      });
      expect(code).toBe(0);
      expect(calls).toEqual([
        ["--user", "daemon-reload"],
        ["--user", "enable", "--now", "ginga-supervisor.service"],
      ]);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  test("CLI: ginga install --supervisor --home <tmp>", () => {
    const home = mkhome();
    try {
      const r = Bun.spawnSync(["bun", join(ROOT, "bin", "ginga.ts"), "install", "--supervisor", "--home", home], {
        cwd: ROOT,
        env: { ...process.env, GINGA_SYSTEMCTL: "/bin/true" },
        stdout: "pipe",
        stderr: "pipe",
      });
      expect(r.exitCode).toBe(0);
      expect(existsSync(join(home, ".config", "systemd", "user", "ginga-supervisor.service"))).toBe(true);
      expect(lstatSync(join(home, ".local", "bin", "ginga")).isSymbolicLink()).toBe(true);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });
});
