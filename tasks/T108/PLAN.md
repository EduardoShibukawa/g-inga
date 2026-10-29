---
mode: padrao
goal: "main_moved_outside_gate sem SHA emite warn 'sem SHA de main no heartbeat' (1 por lane), sem depender de progress"
done_when: "bun test tests/watch_main_moved_nosha.test.ts tests/watch_followup9.test.ts tests/watch_followup8.test.ts tests/serve_watch_tick.test.ts"
touch:
  - src/watch/evaluate.ts
  - tests/watch_main_moved_nosha.test.ts
  - tasks/T108/PLAN.md
tests_frozen: [tests/watch_main_moved_nosha.test.ts]
---
## Contexto
- Follow-up do judge no PLAN-0023: evaluate.ts:164-174 só avisa quando o progress muda. Contrato em .ginga/plans/PLAN-0023-vigia-e-supervisor/TASK-17-main-moved-warn-sem-sha.md.
- Heartbeat de executor (entity executor/*) não é lane e não carrega SHA: não avisa (preserva serve_watch_tick, fixture no_progress com 1 alerta).
