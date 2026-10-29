---
mode: padrao
goal: "Seguir o contrato da TASK-07-discord-thread-id.md (PLAN-0010): fallback Discord devolve thread_id extraído da resposta"
done_when: "bun test tests/notify_thread_id.test.ts"
touch:
  - src/notify/port.ts
  - tests/notify_thread_id.test.ts
  - tasks/T26/PLAN.md
tests_frozen: [tests/notify_thread_id.test.ts]
---
## Contexto
- Follow-up do judge do PLAN-0010 (REPORT-2026-10-28 20:55, TASK-05): `port.ts` só devolve thread_id se já havia thread de entrada; ignorava o ID da resposta do Discord.
- Teste novo em `tests/notify_thread_id.test.ts` (fora do frozen); ver "Fazer" em .ginga/plans/PLAN-0010-tick-serve-notifier/TASK-07-discord-thread-id.md.
