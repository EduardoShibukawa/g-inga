---
mode: padrao
goal: "Corrigir os achados do judge na TASK-03 (T142): estado das TASKs via fila, git real nos repos do PLAN, learnings descartada/armadilha primeiro, frontmatter determinístico no buildHandoff e evento handoff válido pelo schema (context_tokens, data.file, plan no envelope)"
done_when: "bun test tests/handoff_full.test.ts tests/handoff.test.ts"
touch:
  - src/handoff.ts
  - src/verbs/handoff.ts
  - tests/handoff_full.test.ts
  - tasks/T143/PLAN.md
tests_frozen: [tests/handoff_full.test.ts]
---

## Contexto
- PLAN-0013 TASK-16 (correção do judge 2026-10-30T02:07, TASK-03 grave). Contrato: .ginga/plans/PLAN-0013-handoff-e-learnings/TASK-16-handoff-completo.md. Não mexer em tests/handoff.test.ts (frozen do T142) nem em outros frozen.
- Interface do PLAN.md continua: `buildHandoff(root, {plan?, now, git})` → `{path, markdown, tokens}`; acréscimo opcional `opts.queue?: (repoDir: string) => {task, state, receipt?}[]` (padrão: `pinga queue --json --root <repoDir>` via spawn, só se o dir existir; degrada sem crash).
- Git: cwd = `root/<repo>` para cada `repos:` do PLAN (fallback root). Verbo injeta git real e passa `now` uma vez; frontmatter (`type: handoff`, `plan`, `date` de `now`) dentro do markdown do buildHandoff.
- Evento: envelope com `source` e `plan` no topo; `data: {trigger: "boundary", handoff_tokens, context_tokens, file}` — válido em src/events/validate.ts e logging no log.md via ev.plan.
