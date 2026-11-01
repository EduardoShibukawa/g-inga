// tests_frozen — PLAN-0013 TASK-19 (T309): correções do judge na TASK-12.
// `ginga handoff hook --runtime claude` deve despachar o hook real, responder
// no protocolo do runtime, persistir estado em prepare e usar a abertura
// real no redirect; nunca virar um handoff manual com plan="hook".

import { afterEach, describe, expect, test } from "bun:test";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");
const BIN = join(ROOT, "bin", "ginga.ts");
const TRANSCRIPTS = join(ROOT, "tests", "fixtures", "transcripts");
const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

type Fixture = { dir: string; root: string; events: string };

function fixture(mode: "suggest" | "auto"): Fixture {
  const dir = realpathSync(mkdtempSync(join(realpathSync(tmpdir()), "handoff-cli-hook-")));
  dirs.push(dir);
  const root = join(dir, ".ginga");
  mkdirSync(root, { recursive: true });
  writeFileSync(
    join(root, "project.toml"),
    `[handoff]\nmode = "${mode}"\nidle_min = 55\ncontext_tokens = 110000\nmin_context_tokens = 30000\ncooldown_min = 30\nmax_chain = 3\n`,
  );
  return { dir, root, events: join(dir, "events.jsonl") };
}

async function cli(
  fx: Fixture,
  input: Record<string, unknown>,
  extraPath = "",
): Promise<{ code: number; out: string; err: string }> {
  const env = {
    ...process.env,
    ...(extraPath ? { PATH: `${extraPath}:${process.env.PATH ?? ""}` } : {}),
    GINGA_STATE_DB: join(fx.dir, "state.db"),
    GINGA_EVENTS: fx.events,
    GINGA_BY: "",
    GINGA_ROOT: "",
  };
  const proc = Bun.spawn([process.execPath, BIN, "handoff", "hook", "--runtime", "claude", "--json", "--root", fx.root], {
    cwd: fx.dir,
    env,
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
  });
  proc.stdin.write(`${JSON.stringify(input)}\n`);
  proc.stdin.end();
  const [out, err, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { code, out, err };
}

describe("CLI do hook de handoff", () => {
  test("prepare responde pelo hook, grava estado e respeita o cooldown", async () => {
    const fx = fixture("suggest");
    const input = {
      session_id: "ses_prepare",
      transcript_path: join(TRANSCRIPTS, "120k.jsonl"),
      cwd: fx.dir,
      hook_event_name: "Stop",
    };

    const first = await cli(fx, input);
    expect(first.err).toBe("");
    expect(first.code).toBe(0);
    const output = JSON.parse(first.out) as Record<string, unknown>;
    expect(output.path).toBeUndefined();
    expect(output.markdown).toBeUndefined();

    const statePath = join(fx.dir, ".ginga", "state", "handoff-ses_prepare.json");
    expect(existsSync(statePath)).toBe(true);
    const state = JSON.parse(readFileSync(statePath, "utf8"));
    expect(typeof state.lastHandoffTs).toBe("string");
    expect(state.depth).toBe(0);

    // TASK-25/T315: o hook grava em <raiz do bundle>/handoffs, isto é,
    // fx.dir/.ginga/handoffs (raiz resolvida a partir do cwd do stdin).
    const handoffs = join(fx.dir, ".ginga", "handoffs");
    expect(existsSync(handoffs)).toBe(true);
    expect(existsSync(join(fx.dir, "handoffs"))).toBe(false);
    expect(readdirNames(handoffs).some((name) => name.endsWith("-hook.md"))).toBe(false);
    rmSync(handoffs, { recursive: true, force: true });

    const second = await cli(fx, input);
    expect(second.err).toBe("");
    expect(second.code).toBe(0);
    expect(existsSync(handoffs)).toBe(false);
  });

  test("redirect injeta a abertura real e devolve decision/reason do hook", async () => {
    const fx = fixture("auto");
    const bin = join(fx.dir, "fake-bin");
    mkdirSync(bin, { recursive: true });
    const claude = join(bin, "claude");
    const argvFile = join(bin, "argv.txt");
    writeFileSync(
      claude,
      `#!/bin/sh\nprintf '%s\\n' "$@" > ${JSON.stringify(argvFile)}\nprintf 'ses_nova_cli\\n'\n`,
    );
    chmodSync(claude, 0o755);

    const result = await cli(
      fx,
      {
        session_id: "ses_redirect",
        transcript_path: join(TRANSCRIPTS, "ocioso.jsonl"),
        cwd: fx.dir,
        hook_event_name: "UserPromptSubmit",
        prompt: "continue",
      },
      bin,
    );

    expect(result.err).toBe("");
    expect(result.code).toBe(0);
    const output = JSON.parse(result.out) as { decision?: string; reason?: string };
    expect(output.decision).toBe("block");
    expect(output.reason).toContain("ses_nova_cli");
    expect(output.reason).toContain("claude attach ses_nova_cli");

    const statePath = join(fx.dir, ".ginga", "state", "handoff-ses_redirect.json");
    expect(existsSync(statePath)).toBe(true);
    const state = JSON.parse(readFileSync(statePath, "utf8"));
    expect(state.redirected).toBe(true);

    // TASK-25/T315: o redirect passa o modelo real — nunca `claude --model ""`.
    const argv = readFileSync(argvFile, "utf8").split("\n").filter((l) => l !== "");
    const mi = argv.indexOf("--model");
    expect(mi).toBeGreaterThanOrEqual(0);
    expect(argv[mi + 1]).toBeTruthy();
    expect(argv[mi + 1]).not.toBe("");

    // handoff gravado na raiz do bundle, não no cwd
    expect(existsSync(join(fx.dir, ".ginga", "handoffs"))).toBe(true);
    expect(existsSync(join(fx.dir, "handoffs"))).toBe(false);
  });
});

function readdirNames(path: string): string[] {
  return readdirSync(path);
}
