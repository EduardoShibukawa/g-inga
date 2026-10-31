/**
 * Abertura de sessão nova (doc 11 §3): `openSession` por runtime.
 *
 * Claude (`open_claude.ts`): `claude --bg -n "handoff:<plano>" --model <m> "<prompt>"`,
 * stdin fechado; lê o id impresso, `attachCmd = "claude attach <id>"`. NUNCA
 * --resume/--fork-session; não encerra a sessão antiga.
 *
 * Outros runtimes: a mesma interface devolve só o `attachCmd` impresso
 * (`opencode -s`, `pi --name ...`), sem abrir.
 */
import { openClaudeSession } from "./open_claude.ts";
import { emitEvent } from "../events/emit.ts";

export type Spawn = (
  cmd: string[],
  args: string[],
  opts: { cwd: string },
) => { stdout: string; exitCode: number };

export type OpenSessionOpts = {
  handoffPath: string;
  userPrompt: string;
  model: string;
  cwd: string;
  spawn: Spawn;
  now?: Date;
};

export type OpenSessionResult = {
  ok: boolean;
  sessionRef: string | null;
  attachCmd: string;
};

/** Extrai o identificador do plano (ex.: PLAN-0013) do nome do handoff file. */
function extractPlan(handoffPath: string): string | undefined {
  const name = handoffPath.split("/").pop() ?? "";
  const m = name.match(/PLAN-\d+/);
  return m ? m[0] : undefined;
}

function emitHandoffEvent(
  handoffPath: string,
  plan: string | undefined,
  trigger: "cache" | "boundary",
  depth: number,
): void {
  emitEvent({
    kind: "handoff",
    source: "cli",
    ...(plan ? { plan } : {}),
    data: {
      trigger,
      context_tokens: 0,
      handoff_tokens: 0,
      depth,
      file: handoffPath,
    },
  });
}

/**
 * Abre uma nova sessão do runtime indicado. Para Claude, spawna o binário;
 * para outros runtimes, apenas devolve o comando de attach para o usuário
 * imprimir.
 */
export async function openSession(
  runtime: string,
  o: OpenSessionOpts,
): Promise<OpenSessionResult> {
  const plan = extractPlan(o.handoffPath);

  if (runtime === "claude") {
    return openClaudeSession(o, plan);
  }

  // Outros runtimes: não abrem sozinhos — devolvem o attachCmd a imprimir.
  const attachCmd = buildAttachCmd(runtime, o.handoffPath);
  emitHandoffEvent(o.handoffPath, plan, "cache", 0);
  return { ok: true, sessionRef: null, attachCmd };
}

/** Comando de retomada por runtime (sem abrir). */
function buildAttachCmd(runtime: string, handoffPath: string): string {
  if (runtime === "opencode") return `opencode -s ${handoffPath}`;
  return `${runtime} --name ${handoffPath}`;
}
