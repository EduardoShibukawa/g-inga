// tests_frozen — PLAN-0013 TASK-20 (T310): achados do judge TASK-13/TASK-14.
// A CLI real deve aceitar `ginga handoff --open [--runtime R] [PLAN]`: grava o
// handoff, chama openSession e imprime JSON {path, tokens, open, sessionRef,
// attachCmd}. O script da skill (skills/handoff/scripts/handoff.ts) deve
// invocar a CLI com --open e parsear a saída (string) sem lançar erro.

import { afterEach, describe, expect, test } from "bun:test";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");
const BIN = join(ROOT, "bin", "ginga.ts");
const SCRIPT = join(ROOT, "skills", "handoff", "scripts", "handoff.ts");
const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

type Fixture = { dir: string; root: string; db: string; events: string };

function fixture(branch = "plan/0013"): Fixture {
  const dir = realpathSync(mkdtempSync(join(realpathSync(tmpdir()), "handoff-cli-open-")));
  dirs.push(dir);
  const root = join(dir, ".ginga");
  mkdirSync(join(root, "plans", "PLAN-0013-jwt"), { recursive: true });
  writeFileSync(
    join(root, "plans", "PLAN-0013-jwt", "PLAN.md"),
    `---\ntype: plan\ntitle: JWT\nstatus: approved\n---\n## Objetivo\nJWT\n`,
  );
  writeFileSync(
    join(root, "plans", "PLAN-0013-jwt", "TASK-01-proximo.md"),
    `---\ntype: task\ntitle: JWT\n---\nTarefa de teste.\n`,
  );
  Bun.spawnSync(["git", "init", "-q"], { cwd: dir });
  Bun.spawnSync(["git", "checkout", "-q", "-b", branch], { cwd: dir });
  return { dir, root, db: join(dir, "state.db"), events: join(dir, "events.jsonl") };
}

function cli(fx: Fixture, args: string[]): { code: number; out: string; err: string } {
  const env = {
    ...process.env,
    GINGA_STATE_DB: fx.db,
    GINGA_EVENTS: fx.events,
    GINGA_BY: "",
    GINGA_ROOT: "",
  };
  const proc = Bun.spawnSync([process.execPath, BIN, ...args, "--root", fx.root], {
    cwd: fx.dir,
    env,
    stdin: "ignore",
  });
  return {
    code: proc.exitCode,
    out: proc.stdout.toString(),
    err: proc.stderr.toString(),
  };
}

describe("CLI do handoff com --open", () => {
  test("--open --runtime opencode grava o handoff, chama openSession e imprime JSON com open/attachCmd", () => {
    const fx = fixture();
    const result = cli(fx, ["handoff", "--open", "--runtime", "opencode", "--json"]);

    expect(result.err).toBe("");
    expect(result.code).toBe(0);
    const parsed = JSON.parse(result.out) as {
      path: string;
      open: boolean;
      attachCmd: string;
      sessionRef: string | null;
    };
    expect(parsed.open).toBe(true);
    expect(parsed.attachCmd).toContain("opencode");
    expect(parsed.attachCmd).toContain(parsed.path);
    expect(existsSync(join(fx.root, parsed.path))).toBe(true);

    const event = JSON.parse(readFileSync(fx.events, "utf8").trim());
    expect(event.kind).toBe("handoff");
    expect(event.plan).toBe("PLAN-0013");
  });

  test("--open com PLAN posicional e --model Registrado no evento", () => {
    const fx = fixture();
    const result = cli(fx, [
      "handoff",
      "PLAN-0013-jwt",
      "--open",
      "--runtime",
      "pi",
      "--model",
      "glm-free",
      "--json",
    ]);
    expect(result.err).toBe("");
    expect(result.code).toBe(0);
    const parsed = JSON.parse(result.out) as { path: string; open: boolean; attachCmd: string };
    expect(parsed.open).toBe(true);
    expect(parsed.attachCmd).toContain("pi");
    const markdown = readFileSync(join(fx.root, parsed.path), "utf8");
    expect(markdown).toMatch(/^plan: PLAN-0013-jwt$/m);
  });
});

describe("script da skill handoff (skills/handoff/scripts/handoff.ts)", () => {
  test("invoca a CLI com --open e parseia a saída (string) sem lançar erro", () => {
    const dir = realpathSync(mkdtempSync(join(realpathSync(tmpdir()), "handoff-skill-shim-")));
    dirs.push(dir);
    const shim = join(dir, "ginga");
    writeFileSync(
      shim,
      '#!/usr/bin/env bash\nprintf \'path: handoffs/HANDOFF-TESTE.md\\ntokens: 42\\n\'\n',
    );
    chmodSync(shim, 0o755);

    const env = {
      ...process.env,
      PATH: `${dir}:${process.env.PATH ?? ""}`,
      GINGA_HANDOFF_RUNTIME: "opencode",
    };
    const proc = Bun.spawnSync([process.execPath, SCRIPT, "PLAN-0013-jwt"], {
      cwd: dir,
      env,
      stdin: "ignore",
    });
    const out = proc.stdout.toString();
    const err = proc.stderr.toString();
    expect(err).toBe("");
    expect(proc.exitCode).toBe(0);
    const parsed = JSON.parse(out) as { path: string; tokens: number; open: boolean };
    expect(parsed.path).toBe("handoffs/HANDOFF-TESTE.md");
    expect(parsed.tokens).toBe(42);
    expect(parsed.open).toBe(true);
  });
});
