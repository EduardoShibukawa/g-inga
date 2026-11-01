// Extensão Pi do guard de segredos. Carregada por lane.sh com `pi -e <este arquivo>`; nada em ~/.pi.
import { guardCall, guardResult, mode, type Env } from "../../src/guard/run";

export default function (pi: any, env: Env = process.env) {
  if (mode(env) === "off") return;
  pi.on("tool_call", async (event: any) => {
    const v = guardCall(String(event?.toolName ?? ""), event?.input ?? {}, { env });
    return v.block ? { block: true, reason: `guard-segredos: ${v.reason} [${v.rule}]` } : undefined;
  });
  pi.on("tool_result", async (event: any) => {
    if (!Array.isArray(event?.content)) return undefined;
    let changed = false;
    const content = event.content.map((c: any) => {
      if (c?.type !== "text" || typeof c.text !== "string") return c;
      const t = guardResult(c.text, { env });
      if (t === c.text) return c;
      changed = true;
      return { ...c, text: t };
    });
    return changed ? { content, structuredContent: undefined } : undefined;
  });
}
