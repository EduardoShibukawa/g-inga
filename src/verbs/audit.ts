// Auditoria da escrita (doc 05 §1.4): quem, de onde e quando.
// Toda verb de escrita com PLAN no alvo deixa uma linha no `log.md` do PLAN
// e emite o evento correspondente ($GINGA_EVENTS, via src/events/emit).

import { existsSync, writeFileSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import { emitEvent } from "../events/emit";
import type { VerbCtx } from "./registry";

/** Linha no log.md do PLAN (cria o arquivo com cabeçalho se faltar). Silencioso se não há diretório. */
export function appendLog(ctx: VerbCtx, planDir: string | null | undefined, planId: string, detail: string): void {
  if (!planDir) return;
  const line = `- ${new Date().toISOString()} ${detail} · by ${ctx.by} via ${ctx.via}\n`;
  const path = join(planDir, "log.md");
  if (existsSync(path)) appendFileSync(path, line);
  else writeFileSync(path, `# Log — ${planId}\n${line}`);
}

/** transition: mudança de status de spec/plan/task, com autor e origem. */
export function emitTransition(
  ctx: VerbCtx,
  t: { entity: string; from: string; to: string; plan?: string | null; task?: string | null },
): void {
  emitEvent({
    source: "ginga",
    kind: "transition",
    plan: t.plan ?? undefined,
    task: t.task ?? undefined,
    data: { entity: t.entity, from: t.from, to: t.to, by: ctx.by, via: ctx.via },
  });
}

/** answer: resposta de blocker destravando a fila. */
export function emitAnswer(
  ctx: VerbCtx,
  a: { blocker_id: string; answer: string; plan?: string | null; task?: string | null },
): void {
  emitEvent({
    source: "ginga",
    kind: "answer",
    plan: a.plan ?? undefined,
    task: a.task ?? undefined,
    data: { blocker_id: a.blocker_id, answer: a.answer, by: ctx.by, via: ctx.via },
  });
}
