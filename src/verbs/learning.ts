// Verbos de learnings/lessons (doc 06 §5). `learning promote PLAN-NNNN#L-NN` é
// ato explícito de promoção: cria a LESSON em knowledge/lessons/, marca o
// learning como `· promovida` e emite o evento `learning` com `promoted: true`.

import type { VerbCtx, VerbArgs } from "./registry.ts";
import { promote } from "../lessons.ts";
import { emitEvent } from "../events/emit.ts";

function learningPromote(ctx: VerbCtx, args: VerbArgs): unknown {
  const ref = (args.ref ?? "").trim();
  if (!ref) throw new Error("learning promote: falta argumento: ref (PLAN-NNNN#L-NN)");

  const lesson = promote(ctx.root, ref);
  const [planId, learningId] = ref.split("#");

  emitEvent({
    source: "ginga",
    kind: "learning",
    plan: planId,
    data: {
      learning_id: learningId,
      status: lesson.status,
      promoted: true,
      from: lesson.from,
      lesson: lesson.id,
      file: lesson.path,
      by: ctx.by,
      via: ctx.via,
    },
  });

  return { promoted: true, from: lesson.from, lesson: lesson.id, path: lesson.path };
}

export const LEARNING_VERBS = [
  {
    name: "learning promote",
    args: [{ name: "ref", required: true }],
    write: true,
    run: learningPromote,
  },
];
