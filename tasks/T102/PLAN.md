---
mode: padrao
goal: "Seguir o contrato da TASK-02-watch-stale-ready.md (PLAN-0025): vigia stale_ready e ready_writer"
done_when: "bun test tests/watch_stale_ready.test.ts"
touch:
  - src/watch/ready.ts
  - src/watch/index.ts
  - src/watch/rules.ts
  - tests/watch_stale_ready.test.ts
  - tasks/T102/PLAN.md
tests_frozen: [tests/watch_stale_ready.test.ts]
---
## Contexto
- Follow-up 10 do PLAN-0023. Contrato em .ginga/plans/PLAN-0025-hooks-llm-e-stale-ready/TASK-02-watch-stale-ready.md.
