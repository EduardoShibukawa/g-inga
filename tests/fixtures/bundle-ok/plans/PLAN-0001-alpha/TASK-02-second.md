---
type: task
mode: padrao
goal: "Segunda TASK de exemplo"
plan: PLAN-0001-alpha
depends_on: [TASK-01-first]
tier: medium
touch: [src/b.ts, tests/b.test.ts]
done_when: "bun test tests/b.test.ts"
tests_frozen: [tests/b.test.ts]
---
## Fazer
- b
