---
mode: padrao
goal: "O event router transforma eventos ingeridos em notificações conforme as regras de 05 §6, com uma thread por PLAN"
touch: ["src/notify/router.ts", "src/notify/rules.ts", "src/serve.ts", "tests/event_router.test.ts"]
tests_frozen: ["tests/event_router.test.ts"]
done_when: "bun test tests/event_router.test.ts"
---
# T23: Event router (PLAN-0010 TASK-05-event-router)

Materializada de `.ginga/plans/PLAN-0010-tick-serve-notifier/TASK-05-event-router.md`.
