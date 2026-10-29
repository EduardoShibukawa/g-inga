// Registro único de verbos (doc 05 §2): a superfície é cliente fino, toda
// regra mora aqui. Verbo = {name, args, write, run(ctx, args) → JSON}.
// `runVerb` valida o registro (nome e argumentos obrigatórios) e delega:
// escrita em write.ts, leitura em read.ts, auditoria em audit.ts.

import type { Database } from "bun:sqlite";
import * as read from "./read";
import * as write from "./write";

export type VerbCtx = { by: string; via: string; root: string; db: Database };
export type VerbArg = { name: string; required?: boolean };
export type VerbArgs = Record<string, string | undefined>;
export type Verb = { name: string; args: VerbArg[]; write: boolean; run(ctx: VerbCtx, args: VerbArgs): unknown | Promise<unknown> };

function arg(name: string, required = false): VerbArg {
  return required ? { name, required: true } : { name };
}

export const VERBS: Verb[] = [
  { name: "intent new", args: [arg("text", true)], write: true, run: write.intentNew },
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
  { name: "status", args: [], write: false, run: read.status },
  { name: "board", args: [], write: false, run: read.board },
  { name: "inbox", args: [], write: false, run: read.inbox },
  { name: "watch", args: [arg("target", true)], write: false, run: read.watch },
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
