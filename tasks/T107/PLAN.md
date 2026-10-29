---
mode: padrao
goal: "goal_reached só conta gate.result com code === 0 numérico; a string '0' não conta"
done_when: "bun test tests/watch_goal_code_numeric.test.ts tests/watch_goal_reached_strict.test.ts"
touch:
  - src/watch/evaluate.ts
  - tests/watch_goal_code_numeric.test.ts
  - tasks/T107/PLAN.md
tests_frozen: [tests/watch_goal_code_numeric.test.ts]
---
## Contexto
- Follow-up do judge no PLAN-0023: evaluate.ts:234 usa num() (que converte "0"). Contrato em .ginga/plans/PLAN-0023-vigia-e-supervisor/TASK-16-goal-code-numerico.md.
