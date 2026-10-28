import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..", "..");
const BIN = join(ROOT, "bin", "ginga.ts");
const tmps: string[] = [];
afterEach(() => {
  for (const d of tmps.splice(0)) rmSync(d, { recursive: true, force: true });
});
const tmp = (p: string) => {
  const d = realpathSync(mkdtempSync(join(realpathSync(tmpdir()), p)));
  tmps.push(d);
  return d;
};
const write = (p: string, text: string) => {
  mkdirSync(join(p, ".."), { recursive: true });
  writeFileSync(p, text);
};

function source(plugin: string, marketplace = `${plugin}-local`): string {
  const dir = tmp("ginga-src-");
  write(join(dir, ".claude-plugin", "marketplace.json"), JSON.stringify({ name: marketplace, owner: { name: "x" }, plugins: [{ name: plugin, source: "./claude-plugin" }] }));
  write(join(dir, "claude-plugin", "hooks", "x.ts"), "// hook\n");
  return dir;
}

function run(o: { toml?: string; env?: Record<string, string>; sibling?: boolean } = {}) {
  const base = tmp("ginga-inst-");
  const cwd = join(base, "app");
  const home = join(base, "home");
  mkdirSync(cwd, { recursive: true });
  write(join(home, ".claude", "settings.json"), "{}\n");
  write(join(home, ".claude", "plugins", "installed_plugins.json"), JSON.stringify({ version: 2, plugins: {} }));
  write(join(home, ".claude", "plugins", "known_marketplaces.json"), "{}\n");
  if (o.toml !== undefined) write(join(cwd, ".ginga", "project.toml"), o.toml);
  if (o.sibling) {
    write(join(base, "pi-harness", ".claude-plugin", "marketplace.json"), JSON.stringify({ name: "pi-harness-local", plugins: [{ name: "pi-harness" }] }));
  }
  const env: Record<string, string> = {
    PATH: process.env.PATH ?? "/usr/bin:/bin",
    HOME: home,
    XDG_STATE_HOME: join(base, "state"),
    TMPDIR: tmp("ginga-tmp-"),
    GINGA_NOW: "2026-10-28T00:00:00.000Z",
    ...(o.env ?? {}),
  };
  const r = Bun.spawnSync(["bun", BIN, "install", "--dry-run", "--only", "claude", "--home", home, "--manifest", join(base, "state", "manifest.json")], {
    cwd,
    env,
    stdout: "pipe",
    stderr: "pipe",
  });
  return { exit: r.exitCode, out: r.stdout.toString(), err: r.stderr.toString() };
}

describe("ginga install: plugin parametrizado", () => {
  test("fonte do env e plugin do config: a chave vira <plugin>@<plugin>-local, sem pi-harness", () => {
    const r = run({ toml: '[install]\nplugin = "acme"\n', env: { GINGA_PLUGIN_SOURCE: source("acme") } });
    expect(r.exit).toBe(0);
    expect(r.out).toContain("acme@acme-local");
    expect(r.out + r.err).not.toContain("pi-harness");
  });

  test("[install].source vale quando não há env", () => {
    const r = run({ toml: `[install]\nplugin = "acme"\nsource = "${source("acme")}"\n` });
    expect(r.exit).toBe(0);
    expect(r.out).toContain("acme@acme-local");
  });

  test("GINGA_PLUGIN_SOURCE vence [install].source", () => {
    const r = run({ toml: `[install]\nplugin = "acme"\nsource = "${source("outro")}"\n`, env: { GINGA_PLUGIN_SOURCE: source("acme") } });
    expect(r.exit).toBe(0);
    expect(r.out).toContain("acme@acme-local");
  });

  test("sem env e sem [install].source: exit 2 citando as duas fontes, mesmo com ../pi-harness ao lado", () => {
    const r = run({ toml: '[install]\nplugin = "pi-harness"\n', sibling: true });
    expect(r.exit).toBe(2);
    expect(r.err).toContain("GINGA_PLUGIN_SOURCE");
    expect(r.err).toContain("[install]");
  });

  test("sem [install].plugin: exit 2 citando [install]", () => {
    const r = run({ env: { GINGA_PLUGIN_SOURCE: source("acme") } });
    expect(r.exit).toBe(2);
    expect(r.err).toContain("[install]");
    expect(r.err).toContain("plugin");
  });

  test("fonte de outro plugin: exit 2 com o nome esperado na mensagem", () => {
    const r = run({ toml: '[install]\nplugin = "acme"\n', env: { GINGA_PLUGIN_SOURCE: source("outro") } });
    expect(r.exit).toBe(2);
    expect(r.err).toContain("acme");
  });
});
