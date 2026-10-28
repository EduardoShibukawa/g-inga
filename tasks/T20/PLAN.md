---
mode: padrao
goal: "ginga tick despacha cada TASK desbloqueada uma única vez, mesmo com dois ticks em paralelo"
touch: ["src/tick.ts", "src/cli.ts", "tests/tick.test.ts", "tests/tick_parallel.test.ts", "tests/stubs/"]
tests_frozen: ["tests/tick.test.ts", "tests/tick_parallel.test.ts"]
done_when: "bun test tests/tick.test.ts tests/tick_parallel.test.ts"
---
# T14: ginga tick com claim/lease (PLAN-0010 TASK-02-tick-lease)

Materializada de `.ginga/plans/PLAN-0010-tick-serve-notifier/TASK-02-tick-lease.md`.
