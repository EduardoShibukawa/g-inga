import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import type { VerbCtx, VerbArgs } from "./registry.ts";
import { buildHandoff, inferPlan } from "../handoff.ts";
import { runHook } from "../handoff/hook.ts";
export { runHook };
import { emitEvent } from "../events/emit.ts";

function gitReal(args: string[], cwd: string): string {
  try {
    const proc = Bun.spawnSync(["git", ...args], { cwd });
    if (proc.exitCode !== 0) return "";
    return new TextDecoder().decode(proc.stdout || new Uint8Array());
  } catch {
    return "";
  }
}

async function runHookVerb(_ctx: VerbCtx, args: VerbArgs): Promise<unknown> {
  const runtime = (args.runtime ?? "claude").trim() || "claude";
  const stdin = await Bun.stdin.text();
  return runHook(runtime, stdin, { now: new Date() });
}

async function run(ctx: VerbCtx, args: VerbArgs): Promise<unknown> {
  const now = new Date();
  const trigger = (args.trigger as any) || undefined;
  const explicitPlan = (args.plan ?? "").trim() || undefined;
  const plan = explicitPlan ?? (trigger
    ? inferPlan(ctx.root, { git: gitReal, db: ctx.db, cwd: process.cwd() })
    : undefined);
  const opts: any = { plan, now, git: gitReal };
  if (trigger) {
    opts.trigger = trigger;
    if (args.runtime) opts.runtime = args.runtime;
    if (args.from_session) opts.from_session = args.from_session;
    if (args.depth !== undefined) opts.depth = Number(args.depth);
    if (args.notes !== undefined) {
      try {
        opts.notes = readFileSync(args.notes === "-" ? 0 : args.notes, "utf8");
      } catch {
        throw new Error("não consegui ler o arquivo de --notes");
      }
    }
    if (args.transcript) opts.transcript = args.transcript;
    if (args.parent_handoff) opts.parent_handoff = args.parent_handoff;
  }
  const { markdown, path, tokens } = buildHandoff(ctx.root, opts);
  const dir = join(ctx.root, "handoffs");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  writeFileSync(path, markdown, "utf8");

  const context_tokens = Math.ceil(markdown.length / 4);
  emitEvent({
    kind: "handoff",
    source: "cli",
    repo: "ginga",
    plan: plan ?? (trigger ? "session" : "all"),
    data: {
      trigger: trigger ?? "boundary",
      handoff_tokens: tokens,
      context_tokens,
      file: path,
      ...(opts.runtime ? { runtime: opts.runtime } : {}),
      ...(opts.from_session ? { from_session: opts.from_session } : {}),
      ...(opts.depth !== undefined ? { depth: opts.depth } : {}),
    },
  });

  const relPath = relative(ctx.root, path) || path;
  return { path: relPath, tokens, markdown };
}

export const HANDOFF_HOOK_VERB = {
  name: "handoff hook",
  args: [{ name: "runtime" }],
  write: true,
  run: runHookVerb,
};

export const HANDOFF_VERBS = [
  {
    name: "handoff",
    args: [{ name: "plan" }, { name: "trigger" }, { name: "runtime" }, { name: "from_session" }, { name: "depth" }, { name: "notes" }, { name: "transcript" }, { name: "parent_handoff" }],
    write: true,
    run,
  },
];
