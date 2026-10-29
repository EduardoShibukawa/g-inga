// Verbo `triage promote` (doc 02 §4/§5): PLAN de trilha pequena (sem `spec:`)
// ganha uma SPEC draft ligada a ele. Triagem não rebaixa: não existe
// `triage demote` no registro — pedir isso é "verbo desconhecido".

import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { appendLog, emitTransition } from "./audit";
import { findArtifact, fmGet, fmSet, slugify } from "./write";
import type { VerbArgs, VerbCtx } from "./registry";

/** Próximo SPEC-NNNN pelo máximo existente em specs/. */
function nextSpecNumber(root: string): number {
  const specs = join(root, "specs");
  let next = 1;
  if (existsSync(specs)) {
    for (const entry of readdirSync(specs)) {
      const m = /^SPEC-(\d{4})/.exec(entry);
      if (m) next = Math.max(next, Number(m[1]) + 1);
    }
  }
  return next;
}

export function promote(ctx: VerbCtx, args: VerbArgs): unknown {
  const art = findArtifact(ctx.root, args.plan!);
  if (!art) throw new Error(`triage promote: PLAN não encontrado: ${args.plan}`);

  const raw = readFileSync(art.file, "utf8");
  const existing = fmGet(raw, "spec");
  if (existing) throw new Error(`triage promote: ${art.id} já é trilha feature (spec: ${existing}) — não rebaixa`);

  const title = (fmGet(raw, "title") ?? art.id).replace(/\s+/g, " ").trim();
  const intent = fmGet(raw, "intent");
  const specId = `SPEC-${String(nextSpecNumber(ctx.root)).padStart(4, "0")}-${slugify(title)}`;

  const fm = ["type: spec", `title: ${title}`];
  if (intent) fm.push(`intent: ${intent}`);
  fm.push("status: draft", "bench: none");
  writeFileSync(join(ctx.root, "specs", `${specId}.md`), `---\n${fm.join("\n")}\n---\n## Objetivo\nA definir (promovido de ${art.id} pela triagem).\n`);

  writeFileSync(art.file, fmSet(raw, "spec", specId));
  appendLog(ctx, art.dir, art.id, `triage promote ${art.id}: small → feature (spec ${specId})`);
  emitTransition(ctx, { entity: "plan", from: "small", to: "feature", plan: art.id });

  return { plan: art.id, spec: specId, from: "small", to: "feature", track: "feature" };
}
