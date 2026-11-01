// Plugin opencode do guard de segredos. Só vale em `opencode run --standalone` com GINGA_GUARD_LANE no ambiente.
import { guardCall, guardResult, mode, type Env } from "../../src/guard/run";

export const GingaGuard = async (_ctx?: unknown, env: Env = process.env) => {
  if (mode(env) === "off") return {};
  return {
    "tool.execute.before": async (input: any, output: any) => {
      const v = guardCall(String(input?.tool ?? ""), output?.args ?? {}, { env });
      if (v.block) throw new Error(`guard-segredos: ${v.reason} [${v.rule}]`);
    },
    "tool.execute.after": async (input: any, output: any) => {
      if (typeof output?.output === "string") output.output = guardResult(output.output, { env });
    },
  };
};
export default GingaGuard;
