import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import type { VerbCtx, VerbArgs } from "./registry.ts";
import { buildHandoff } from "../handoff.ts";
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

async function run(ctx: VerbCtx, args: VerbArgs): Promise<unknown> {
  const plan = (args.plan ?? "").trim() || undefined;
  const now = new Date();
  const trigger = (args.trigger as any) || undefined;
  const opts: any = { plan, now, git: gitReal };
  if (trigger) {
    opts.trigger = trigger;
    if (args.runtime) opts.runtime = args.runtime;
    if (args.from_session) opts.from_session = args.from_session;
    if (args.depth !== undefined) opts.depth = Number(args.depth);
    if (args.notes) opts.notes = args.notes;
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

export const HANDOFF_VERBS = [
  {
    name: "handoff",
    args: [{ name: "plan" }, { name: "trigger" }, { name: "runtime" }, { name: "from_session" }, { name: "depth" }, { name: "notes" }, { name: "transcript" }, { name: "parent_handoff" }],
    write: true,
    run,
  },
];
