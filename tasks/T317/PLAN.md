---
mode: mvp
goal: "inbox() traz o item 'promover?' quando o PLAN fecha (status done) e há learnings não promovidos no LEARNINGS.md dele — corrige o achado do judge 2026-11-01 na TASK-05 (src/verbs/read.ts:77 só lista aprovar e blocker)"
done_when: "bun test tests/inbox_promover.test.ts tests/verbs.test.ts"
touch:
  - src/verbs/read.ts
  - src/lessons.ts
  - tests/inbox_promover.test.ts
tests_frozen:
  - tests/inbox_promover.test.ts
---

## Context
- Judge 2026-11-01 (TASK-05): falta o item de Inbox "promover?" ao fechar o PLAN.
- `listBundle` passa a devolver também o caminho do PLAN.md; para cada plan com status `done`, ler o LEARNINGS.md do diretório do PLAN (exportar `listLearnings(planDir)` em src/lessons.ts, reaproveitando `parseLearnings`) e, se houver learnings sem `· promovida`, empurrar `{ id: planId, type: "promover?", plan: planId, pending: ["L-02", ...] }`.
- PLAN não done ou tudo promovido → sem item. Não alterar os itens aprovar/blocker.
- Sem scripts de depuração fora do touch (use /tmp).
