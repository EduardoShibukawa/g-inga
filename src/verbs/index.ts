// Verbo `index` (PLAN-0012 TASK-06/14): gera o .ginga/index.md do bundle a
// partir do modelo do quadro (src/index_md.ts). `--check` só confere e sai 1
// (via excessão -> exit 1 na CLI) se estiver desatualizado.

import { basename, dirname } from "node:path";
import { checkIndex, writeIndex } from "../index_md";
import type { VerbArgs, VerbCtx } from "./registry";

/** Nos verbos, ctx.root é o bundle (<ws>/.ginga); writeIndex/checkIndex
 *  esperam a raiz do workspace. */
export function workspaceRoot(ctxRoot: string): string {
  return basename(ctxRoot) === ".ginga" ? dirname(ctxRoot) : ctxRoot;
}

export function indexVerb(ctx: VerbCtx, args: VerbArgs): unknown {
  const ws = workspaceRoot(ctx.root);
  if (args.check !== undefined && args.check !== "" && args.check !== "false") {
    if (!checkIndex(ws)) {
      throw new Error("index.md desatualizado: rode `ginga index` para regenerar");
    }
    return { ok: true, check: "ok", changed: false };
  }
  return { ok: true, ...writeIndex(ws, ctx.db) };
}
