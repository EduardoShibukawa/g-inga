---
mode: padrao
goal: "main_moved_outside_gate compara o SHA de main por entidade/lane, não num conjunto global"
done_when: "bun test tests/watch_main_sha_per_lane.test.ts tests/watch_main_moved_nosha.test.ts tests/watch_followup8.test.ts tests/watch_followup9.test.ts tests/serve_watch_tick.test.ts tests/watch_rules.test.ts"
touch:
  - src/watch/evaluate.ts
  - tests/watch_main_sha_per_lane.test.ts
  - tasks/T110/PLAN.md
tests_frozen: [tests/watch_main_sha_per_lane.test.ts]
---
## Contexto
- Follow-up do judge 00:51 no PLAN-0023. Contrato em .ginga/plans/PLAN-0023-vigia-e-supervisor/TASK-19-main-sha-por-lane.md.
