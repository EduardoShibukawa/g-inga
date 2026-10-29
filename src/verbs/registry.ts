// Registro único de verbos (doc 05 §2): a superfície é cliente fino, toda
// regra mora aqui. Verbo = {name, args, write, run(ctx, args) → JSON}.
// `runVerb` valida o registro (nome e argumentos obrigatórios) e delega:
// escrita em write.ts, leitura em read.ts, auditoria em audit.ts, operação
// (equivalentes do bin/homelab) em ops.ts.

import type { Database } from "bun:sqlite";
import * as initVerb from "./init";
import * as ops from "./ops.ts";
import * as read from "./read";
import * as triageVerb from "./triage";
import * as write from "./write";

export type VerbCtx = { by: string; via: string; root: string; db: Database };
/** `bool` marca argumento flag (`--yes`): a CLI aceita sem valor (T127). */
export type VerbArg = { name: string; required?: boolean; bool?: boolean };
export type VerbArgs = Record<string, string | undefined>;
export type Verb = { name: string; args: VerbArg[]; write: boolean; run(ctx: VerbCtx, args: VerbArgs): unknown | Promise<unknown> };

function arg(name: string, required = false): VerbArg {
  return required ? { name, required: true } : { name };
}

export const VERBS: Verb[] = [
  { name: "init", args: [{ name: "yes", bool: true }], write: true, run: initVerb.run },
  { name: "intent new", args: [arg("text", true), arg("track"), arg("files"), arg("impact"), arg("contract")], write: true, run: write.intentNew },
  { name: "approve", args: [arg("id", true)], write: true, run: write.approve },
  { name: "reject", args: [arg("id", true), arg("reason")], write: true, run: write.reject },
  { name: "answer", args: [arg("blocker_id", true), arg("text", true)], write: true, run: write.answer },
  { name: "decide", args: [arg("item", true), arg("option", true)], write: true, run: write.decide },
  { name: "pause", args: [arg("plan")], write: true, run: (ctx, args) => write.setPaused(ctx, args, 1) },
  { name: "resume", args: [arg("plan")], write: true, run: (ctx, args) => write.setPaused(ctx, args, 0) },
  { name: "retry", args: [arg("plan", true), arg("task", true), arg("tier")], write: true, run: write.retry },
  { name: "escalate", args: [arg("plan", true), arg("task", true)], write: true, run: write.escalate },
  { name: "cancel", args: [arg("plan", true)], write: true, run: write.cancel },
  { name: "budget raise", args: [arg("plan", true), arg("usd", true)], write: true, run: write.budgetRaise },
  { name: "triage promote", args: [arg("plan", true)], write: true, run: triageVerb.promote },
  { name: "status", args: [], write: false, run: read.status },
  { name: "board", args: [], write: false, run: read.board },
  { name: "inbox", args: [], write: false, run: read.inbox },
  { name: "watch", args: [arg("target", true)], write: false, run: read.watch },
  // Operação (PLAN-0015 TASK-03): equivalente para cada subcomando do
  // bin/homelab. `verify`/`maestro` delegam ao pinga do PATH, `gira` é
  // passthrough, `web` controla o `serve` do ginga; ctl/tui/hermes/hud
  // agem só na CLI (em API/tty ausente devolvem o motivo, nunca bloqueiam).
  { name: "ctl", args: [{ name: "popup", bool: true }, ...ops.passthrough()], write: true, run: ops.ctl },
  { name: "web", args: [arg("action")], write: true, run: ops.web },
  { name: "tui", args: [arg("session")], write: true, run: ops.tui },
  { name: "hermes", args: ops.passthrough(), write: true, run: ops.hermes },
  { name: "hud", args: ops.passthrough(), write: true, run: ops.hud },
  { name: "verify", args: ops.passthrough(true), write: true, run: ops.verify },
  { name: "maestro", args: ops.passthrough(true), write: true, run: ops.maestro },
  { name: "gira", args: ops.passthrough(true), write: true, run: ops.gira },
];

export function getVerb(name: string): Verb | undefined {
  return VERBS.find((v) => v.name === name);
}

export async function runVerb(name: string, ctx: VerbCtx, args: VerbArgs): Promise<unknown> {
  const verb = getVerb(name);
  if (!verb) throw new Error(`verbo desconhecido: ${name}`);
  for (const a of verb.args) {
    const value = args[a.name];
    if (a.required && (value === undefined || value.trim() === "")) {
      throw new Error(`falta argumento: ${a.name}`);
    }
  }
  return verb.run(ctx, args);
}
