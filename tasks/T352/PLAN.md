---
mode: padrao
goal: "O ginga registra o experimento handoff-ab com os braços native-compact e ginga-handoff e importa eventos handoff/attempt de um JSONL"
done_when: "bun test tests/bench_handoff_ab.test.ts"
touch:
  - src/bench/store.ts
  - src/bench/handoff_ab.ts
  - tests/bench_handoff_ab.test.ts
  - tests/fixtures/handoff-ab.jsonl
tests_frozen:
  - tests/bench_handoff_ab.test.ts
  - tests/fixtures/handoff-ab.jsonl
---
## Context
- PLAN-0014 TASK-06: bench próprio, experimento handoff-ab v1 e importação idempotente.
