---
mode: padrao
goal: "Seguir o contrato da TASK-09-router-thread-persist.md (PLAN-0023): router persiste thread_id em toda entrega, inclusive retries recuperados pelo drain"
done_when: "bun test tests/notify_router_thread_persist.test.ts"
touch:
  - src/notify/router.ts
  - src/notify/queue.ts
  - tests/notify_router_thread_persist.test.ts
  - tasks/T36/PLAN.md
tests_frozen: [tests/notify_router_thread_persist.test.ts]
---
## Contexto
- Correcao dos achados do judge da rodada 6 (PLAN-0023).
