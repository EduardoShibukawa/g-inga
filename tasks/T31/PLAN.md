---
mode: padrao
goal: "Notifier com fila duravel no state.db: entrega pelo menos uma vez, falha mantem item na fila, dedupe por key e digest de N itens num envio; router consome a fila quando houver pendencia"
done_when: "bun test tests/notify_queue.test.ts"
touch:
  - src/notify/queue.ts
  - src/notify/router.ts
  - src/state/db.ts
  - tests/notify_queue.test.ts
  - tests/fixtures/watch/goal_reached.jsonl
  - tasks/T31/PLAN.md
tests_frozen: [tests/notify_port.test.ts, tests/notify_thread_id.test.ts, tests/event_router.test.ts, tests/state_db.test.ts]
---
## Contexto
- TASK-04 do PLAN-0023 (vigia): fila duravel do notifier, substitui .ginga/bin/notify.sh (TASK-06 corta).
- Tabela nova no state.db (migracao IF NOT EXISTS); ack so apos envio; retry na proxima conexao; digest junta repetidos na mesma conexao.
