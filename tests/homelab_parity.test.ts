// tests_frozen — PLAN-0015 TASK-03 (ginga cobre os subcomandos do homelab).
//
// - `src/workspace.ts` novo: `findWorkspace(fromDir)` — `GINGA_WORKSPACE` vence (vazio = não
//   configurado); senão sobe até o `.ginga/` mais próximo; sem ancestral com `.ginga` → erro.
// - Cada grupo de subcomandos do dispatcher de `bin/homelab` (status, web, tui, hermes, hud,
//   verify, maestro, gira, ctl) tem verbo correspondente no registro do ginga.
// - `verify` e `maestro` delegam ao `pinga` do PATH; `gira` é passthrough pelo PATH.
// - `verify`/`maestro`/`gira` rodam o binário do PATH com os argumentos na ordem; sem
//   `bin/homelab` visível (sandbox do pinga), só o bloco de paridade fica bloqueado.

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, parse } from "node:path";
import { VERBS } from "../src/verbs/registry";

const ROOT = join(import.meta.dir, "..");
const GINGA_BIN = join(ROOT, "bin", "ginga.ts");

// Andar próprio até o `.ginga` mais próximo — sem importar o módulo sob teste.
function nearestWorkspace(from: string): string | null {
  let dir = realpathSync(from);
  for (;;) {
    if (existsSync(join(dir, ".ginga"))) return dir;
    const { root } = parse(dir);
    if (dir === root) return null;
    dir = dirname(dir);
  }
}

function homelabRoot(): string | null {
  const env = process.env.GINGA_WORKSPACE ?? "";
  try {
    const ws = env !== "" ? env : nearestWorkspace(ROOT);
    return ws && existsSync(join(ws, "bin", "homelab")) ? ws : null;
  } catch {
    return null;
  }
}

let tmp: string;
beforeEach(() => {
  tmp = realpathSync(mkdtempSync(join(realpathSync(tmpdir()), "ginga-parity-")));
});
afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe("src/workspace.ts: GINGA_WORKSPACE ou .ginga mais próximo", () => {
  test("findWorkspace existe", async () => {
    const mod = await import("../src/workspace").catch(() => null);
    expect(mod).not.toBeNull();
    expect(typeof (mod as { findWorkspace?: unknown }).findWorkspace).toBe("function");
  });

  test("GINGA_WORKSPACE vence", async () => {
    const { findWorkspace } = (await import("../src/workspace")) as { findWorkspace: (d: string) => string };
    const other = realpathSync(mkdtempSync(join(realpathSync(tmpdir()), "ginga-parity-env-")));
    try {
      process.env.GINGA_WORKSPACE = other;
      const nested = join(tmp, "a", "b");
      mkdirSync(nested, { recursive: true });
      expect(findWorkspace(nested)).toBe(other);
    } finally {
      process.env.GINGA_WORKSPACE = "";
      rmSync(other, { recursive: true, force: true });
    }
  });

  test("sem GINGA_WORKSPACE: sobe até achar .ginga; sem .ginga em nenhum lugar → erro", async () => {
    process.env.GINGA_WORKSPACE = "";
    const { findWorkspace } = (await import("../src/workspace")) as { findWorkspace: (d: string) => string };
    mkdirSync(join(tmp, ".ginga"), { recursive: true });
    const nested = join(tmp, "repo", "sub");
    mkdirSync(nested, { recursive: true });
    expect(findWorkspace(nested)).toBe(tmp);
    expect(() => findWorkspace("/")).toThrow();
  });

  test("sem caminhos absolutos de usuário nos módulos novos", () => {
    for (const rel of ["src/workspace.ts", "src/verbs/ops.ts"]) {
      expect(existsSync(join(ROOT, rel))).toBe(true);
      expect(readFileSync(join(ROOT, rel), "utf8")).not.toMatch(/\/home\/[a-z0-9._-]+\//i);
    }
  });
});

const parity = homelabRoot();
const tParity = parity ? test : test.skip;

tParity("cada subcomando do dispatcher do bin/homelab tem verbo no registro", () => {
  const src = readFileSync(join(parity as string, "bin", "homelab"), "utf8");
  const at = src.indexOf('case "$COMMAND" in');
  expect(at).toBeGreaterThan(-1);
  const block = src.slice(at, src.indexOf("\nesac", at));
  const groups = [...block.matchAll(/^ {4}([a-z][a-z0-9|-]*)\)$/gm)].map((m) => m[1]!.split("|"));
  expect(groups.length).toBeGreaterThanOrEqual(9);
  const names = new Set(VERBS.map((v) => v.name.split(" ")[0]!));
  for (const group of groups) {
    expect(group.some((alias) => names.has(alias))).toBe(true);
  }
});

describe("delegação pelo PATH", () => {
  let stubbed: string;
  let env: Record<string, string>;
  beforeEach(() => {
    stubbed = join(tmp, "ws");
    mkdirSync(join(stubbed, ".ginga"), { recursive: true });
    mkdirSync(join(stubbed, "bin"), { recursive: true });
    for (const name of ["pinga", "gira"]) {
      writeFileSync(join(stubbed, "bin", name), `#!/bin/sh\necho ${name} "$@" >> "${stubbed}/${name}.log"\n`);
      chmodSync(join(stubbed, "bin", name), 0o755);
    }
    env = {
      ...process.env,
      PATH: `${join(stubbed, "bin")}:${dirname(process.execPath)}:/usr/bin:/bin`,
      GINGA_WORKSPACE: stubbed,
      GINGA_STATE_DB: join(tmp, "state.db"),
      GINGA_EVENTS: join(tmp, "events.jsonl"),
      GINGA_ROOT: "",
      GINGA_BY: "",
    };
  });

  function ginga(...args: string[]) {
    return Bun.spawnSync([process.execPath, GINGA_BIN, ...args], { cwd: stubbed, env, stdout: "pipe", stderr: "pipe" });
  }

  const log = (name: string) => (existsSync(join(stubbed, `${name}.log`)) ? readFileSync(join(stubbed, `${name}.log`), "utf8").trim().split("\n") : []);

  test("verify delega ao pinga do PATH", () => {
    const r = ginga("verify", "tasks/T1/PLAN.md", "--root", join(stubbed, ".ginga"));
    expect(r.stderr.toString()).toBe("");
    expect(r.exitCode).toBe(0);
    expect(log("pinga")).toEqual(["pinga verify tasks/T1/PLAN.md"]);
  });

  test("maestro delega ao pinga do PATH", () => {
    const r = ginga("maestro", "scoreboard", "--root", join(stubbed, ".ginga"));
    expect(r.exitCode).toBe(0);
    expect(log("pinga")).toEqual(["pinga maestro scoreboard"]);
  });

  test("gira é passthrough pelo PATH", () => {
    const r = ginga("gira", "outline", "src/a.ts", "--root", join(stubbed, ".ginga"));
    expect(r.exitCode).toBe(0);
    expect(log("gira")).toEqual(["gira outline src/a.ts"]);
  });
});
