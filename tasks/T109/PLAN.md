---
mode: padrao
goal: "lane.round end fecha só o start correspondente (pareado por ordem temporal); start posterior sem end continua visível para lane_dead"
done_when: "bun test tests/watch_lane_dead_pairing.test.ts tests/watch_rules.test.ts"
touch:
  - src/watch/evaluate.ts
  - tests/watch_lane_dead_pairing.test.ts
  - tasks/T109/PLAN.md
tests_frozen: [tests/watch_lane_dead_pairing.test.ts]
---
## Contexto
- Follow-up do judge 00:51 no PLAN-0023. Contrato em .ginga/plans/PLAN-0023-vigia-e-supervisor/TASK-18-lane-dead-pareamento.md.
