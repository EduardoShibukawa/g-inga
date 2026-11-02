import { homedir } from "node:os";
import { readQuotas } from "../quota/index.ts";
import type { VerbArgs, VerbCtx } from "./registry.ts";

export function quota(ctx: VerbCtx, _args: VerbArgs): unknown {
  const home = process.env.HOME ?? homedir();
  return readQuotas({ home, db: ctx.db });
}
