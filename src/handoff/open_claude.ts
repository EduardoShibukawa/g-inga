/**
 * Claude: abre sessão nova com `claude --bg -n "handoff:<plano>" --model <m>`.
 * Lê o id impresso no stdout; `attachCmd = "claude attach <id>"`.
 * NUNCA --resume/--fork-session; não encerra a sessão antiga.
 */
import type { OpenSessionOpts, OpenSessionResult } from "./open.ts";
import { emitEvent } from "../events/emit.ts";

/** Monta o argv do `claude` para abrir uma sessão de handoff. */
export function claudeOpenArgv(
  projectName: string,
  model: string,
  userPrompt: string,
  handoffPath: string,
): string[] {
  const prompt = `handoff:${projectName}\n\n${userPrompt}\n(handoff: ${handoffPath})`;
  return [
    "--bg",
    "-n",
    `handoff:${projectName}`,
    "--model",
    model,
    prompt,
  ];
}

export async function openClaudeSession(
  o: OpenSessionOpts,
  plan?: string,
): Promise<OpenSessionResult> {
  const projectName = plan ?? "handoff";
  const argv = claudeOpenArgv(projectName, o.model, o.userPrompt, o.handoffPath);
  const result = o.spawn(["claude"], argv, { cwd: o.cwd });
  const sessionRef = result.stdout.trim() || null;
  const attachCmd =
    sessionRef !== null ? `claude attach ${sessionRef}` : "";

  emitEvent({
    kind: "handoff",
    source: "cli",
    ...(plan ? { plan } : {}),
    data: {
      trigger: "cache",
      context_tokens: 0,
      handoff_tokens: 0,
      depth: 0,
      file: o.handoffPath,
    },
  });

  return {
    ok: result.exitCode === 0,
    sessionRef,
    attachCmd,
  };
}
