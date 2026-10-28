---
mode: padrao
goal: "ginga serve roda o tick por timer e por evento; systemd timer e cron do Hermes chamam o mesmo ginga tick"
touch: ["src/serve.ts", "src/cli.ts", "contrib/systemd/ginga-tick.service", "contrib/systemd/ginga-tick.timer", "contrib/systemd/ginga-serve.service", "docs/hermes-cron.md", "tests/serve.test.ts"]
tests_frozen: ["tests/serve.test.ts"]
done_when: "bun test tests/serve.test.ts && grep -q 'ginga tick' contrib/systemd/ginga-tick.service docs/hermes-cron.md"
---
# T21: ginga serve + timers (PLAN-0010 TASK-03-serve-timers)

Materializada de `.ginga/plans/PLAN-0010-tick-serve-notifier/TASK-03-serve-timers.md`.
