---
mode: padrao
goal: "Follow-up 9 do PLAN-0023: main_moved_outside_gate nao avalia sem SHA de main (resultado unknown + alerta warn); nao cai no progresso"
done_when: "bun test tests/watch_followup9.test.ts"
touch:
  - src/watch/evaluate.ts
  - tests/watch_followup9.test.ts
  - tasks/T40/PLAN.md
tests_frozen: [tests/watch_followup8.test.ts]
---

## Contexto
- Achados do judge da rodada 22:31 (PLAN-0023): TASK-12 ainda usa progress como fallback sem SHA.
- Correcao cirurgica em src/watch/evaluate.ts.
