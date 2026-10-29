---
mode: padrao
goal: "Seguir o contrato da TASK-01-eventos-vigia.md (PLAN-0023): kinds heartbeat/lane.round/gate.result/alvo.check no schema v1 e fixtures dos 6 incidentes passando no validateEvent"
done_when: "bun test tests/events_watch_kinds.test.ts"
touch:
  - src/events/validate.ts
  - tests/events_watch_kinds.test.ts
  - tests/fixtures/watch/goal_reached.jsonl
  - tests/fixtures/watch/judge_shopping.jsonl
  - tests/fixtures/watch/lane_dead.jsonl
  - tests/fixtures/watch/main_moved_outside_gate.jsonl
  - tests/fixtures/watch/no_progress.jsonl
  - tests/fixtures/watch/report_mismatch.jsonl
  - tasks/T28/PLAN.md
tests_frozen: [tests/events_watch_kinds.test.ts]
---
## Contexto
- TASK-01 do PLAN-0023 (vigia): sinais novos do SPEC-0003/PLAN-0023 sem tocar os kinds existentes.
- Teste novo em `tests/events_watch_kinds.test.ts` + fixtures em `tests/fixtures/watch/` (fora do escopo dos testes congelados); ver "Fazer" em .ginga/plans/PLAN-0023-vigia-e-supervisor/TASK-01-eventos-vigia.md.
