---
mode: padrao
goal: "Seguir o contrato da TASK-08-supervisor-no-cap.md (PLAN-0023): supervisor sem teto de dez iteracoes, encerra so em no_pending/stop/maxRestarts"
done_when: "bun test tests/supervisor_iterations.test.ts"
touch:
  - src/supervisor.ts
  - tests/supervisor_iterations.test.ts
  - tasks/T35/PLAN.md
tests_frozen: [tests/supervisor_iterations.test.ts]
---
## Contexto
- Correcao dos achados do judge da rodada 6 (PLAN-0023).
