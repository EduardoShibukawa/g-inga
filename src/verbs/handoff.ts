import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
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
  const { markdown, path, tokens } = buildHandoff(ctx.root, { plan, now, git: gitReal });

  // ensure handoffs dir
  const dir = join(ctx.root, "handoffs");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  writeFileSync(path, markdown, "utf8");

  const context_tokens = Math.ceil(markdown.length / 4);
  emitEvent({
    kind: "handoff",
    source: "cli",
    repo: "ginga",
    plan: plan ?? "all",
    data: {
      trigger: "boundary",
      handoff_tokens: tokens,
      context_tokens,
      file: path,
    },
  });

  return { path, tokens, markdown };
}

export const HANDOFF_VERBS = [
  {
    name: "handoff",
    args: [{ name: "plan" }],
    write: true,
    run,
  },
];
