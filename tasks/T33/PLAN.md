---
mode: padrao
goal: "todo envio do router passa pela fila durável (enqueue -> drain), sem caminho direto; item com canal falhando fica na fila e sai no próximo drain bem-sucedido"
done_when: "bun test tests/notify_router_queue.test.ts"
touch:
  - src/notify/router.ts
  - src/notify/queue.ts
  - tests/notify_router_queue.test.ts
  - tasks/T33/PLAN.md
tests_frozen: [tests/notify_queue.test.ts, tests/event_router.test.ts, tests/notify_port.test.ts, tests/notify_thread_id.test.ts]
---
## Contexto
- PLAN-0023 follow-up 3: router consome a fila durável.
