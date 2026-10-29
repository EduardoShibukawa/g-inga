---
mode: padrao
goal: "ginga tick decide por função pura a próxima ação de cada PLAN aprovado e chama o comando configurado em [commands]"
done_when: "bun test tests/tick_plan.test.ts"
touch:
  - src/tick_plan.ts
  - src/tick.ts
  - tests/tick_plan.test.ts
tests_frozen: [tests/tick_plan.test.ts]
---

## Contexto
- PLAN-0028 TASK-04. `nextAction` é pura e a entrada usa ids qualificados `PLAN/TASK`.
- O tick lê a fase no state.db, executa um comando de `[commands]` e chama `setPhase`.
- O frozen cobre oito ações e a execução de `run` com argv observável.
