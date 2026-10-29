---
mode: padrao
goal: "Seguir o contrato da TASK-07-watch-goal-reached-strict.md (PLAN-0023): goal_reached estrito (todos os gates code 0, todos os alvo.check ok, sem pendencia) e validateEvent valida data.actions como lista de strings"
done_when: "bun test tests/watch_goal_reached_strict.test.ts"
touch:
  - src/events/validate.ts
  - src/watch/evaluate.ts
  - tests/watch_goal_reached_strict.test.ts
  - tasks/T34/PLAN.md
tests_frozen: [tests/watch_goal_reached_strict.test.ts]
---
## Contexto
- Correcao dos achados do judge da rodada 6 (PLAN-0023).
