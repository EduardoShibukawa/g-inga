---
mode: mvp
goal: "Cada evento de um PLAN vira uma linha no log.md da pasta dele, criado se não existir"
done_when: "bun test tests/plan_log.test.ts"
touch:
  - src/plan_log.ts
  - src/notify/router.ts
  - tests/plan_log.test.ts
  - tasks/T140/PLAN.md
tests_frozen: [tests/plan_log.test.ts]
---

## Contexto
- PLAN-0013 TASK-01. Contrato: .ginga/plans/PLAN-0013-handoff-e-learnings/TASK-01-log-automatico.md.
- Interfaces (PLAN.md): `formatLogLine(ev): string | null`, `appendPlanLog(root, ev): {appended}` (root = pasta `.ginga` do bundle; PLAN-NNNN casa com a pasta `plans/PLAN-NNNN-*/`).
- Formato attempt: `AAAA-MM-DD TASK-xx <runtime/modelo> tentativa N pass|fail[: motivo]` — data de `ev.ts` (UTC), modelo de `data.model`, N de `data.attempt_n`, `data.passed`. kinds transicionáveis: transition, receipt, answer, handoff, learning → `AAAA-MM-DD <kind> <resumo>`; demais → null.
- Idempotente por `ev.id` (reprocessar o mesmo id não duplica a linha). Só append; nunca reescrever.
- O gancho de integração vive em `src/notify/router.ts` (o router é quem consome o stream de eventos); nenhum teste congelado exercita o router — a UNIT de `src/plan_log.ts` é a prova.
