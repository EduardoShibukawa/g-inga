---
mode: padrao
goal: "Porta de notificação com adapters hermes, webhook do Discord e stdout, em cadeia de fallback"
touch: ["src/notify/port.ts", "src/notify/hermes.ts", "src/notify/discord.ts", "src/notify/stdout.ts", "tests/notify_port.test.ts"]
tests_frozen: ["tests/notify_port.test.ts"]
done_when: "bun test tests/notify_port.test.ts"
---
# T16: Porta de notificação (PLAN-0010 TASK-04-notifier-port)

Materializada de `.ginga/plans/PLAN-0010-tick-serve-notifier/TASK-04-notifier-port.md`.
