---
mode: padrao
goal: "Seguir o contrato da TASK-03-ready-write.md (PLAN-0025): ginga ready write"
done_when: "bun test tests/ready_write.test.ts"
touch:
  - src/ready.ts
  - src/cli.ts
  - tests/ready_write.test.ts
  - tasks/T103/PLAN.md
tests_frozen: [tests/ready_write.test.ts]
---
## Contexto
- Follow-up 10 do PLAN-0023. Contrato em .ginga/plans/PLAN-0025-hooks-llm-e-stale-ready/TASK-03-ready-write.md.
