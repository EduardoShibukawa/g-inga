import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { VerbCtx, VerbArgs } from "./registry.ts";
import { buildHandoff } from "../handoff.ts";
import { emitEvent } from "../events/emit.ts";

async function run(ctx: VerbCtx, args: VerbArgs): Promise<unknown> {
  const plan = (args.plan ?? "").trim() || undefined;
  const { markdown, path, tokens } = buildHandoff(ctx.root, { plan, now: new Date() });

  // ensure handoffs dir
  const dir = join(ctx.root, "handoffs");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const front = `---\ntype: handoff\nplan: ${plan ?? "all"}\ndate: ${new Date().toISOString()}\n---\n\n`;
  const content = front + markdown;
  writeFileSync(path, content, "utf8");

  emitEvent({
    kind: "handoff",
    repo: "ginga",
    data: {
      trigger: "boundary",
      handoff_tokens: tokens,
      plan: plan ?? null,
      path,
    },
  });

  return { path, tokens, markdown: content };
}

export const HANDOFF_VERBS = [
  {
    name: "handoff",
    args: [{ name: "plan" }],
    write: true,
    run,
  },
];
