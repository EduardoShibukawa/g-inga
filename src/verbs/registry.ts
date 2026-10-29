// Stub do contrato (PLAN-0011 TASK-01): só os tipos e as assinaturas, para o RED
// ser por asserção e não por erro de import. A implementação vem do executor.
import type { Database } from "bun:sqlite";

export type VerbCtx = { by: string; via: string; root: string; db: Database };
export type VerbArg = { name: string; required?: boolean };
export type VerbArgs = Record<string, string | undefined>;
export type Verb = { name: string; args: VerbArg[]; write: boolean; run(ctx: VerbCtx, args: VerbArgs): unknown | Promise<unknown> };

export const VERBS: Verb[] = [];

export function getVerb(name: string): Verb | undefined {
  return VERBS.find((v) => v.name === name);
}

export async function runVerb(name: string, ctx: VerbCtx, args: VerbArgs): Promise<unknown> {
  void name; void ctx; void args;
  throw new Error("não implementado");
}
