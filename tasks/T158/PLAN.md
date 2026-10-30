---
mode: padrao
goal: "Um modelo único deriva as colunas do quadro e os itens do Inbox a partir do bundle, do state.db e dos receipts"
done_when: "bun test tests/board.test.ts"
touch:
  - src/board.ts
  - src/verbs/read.ts
  - tests/board.test.ts
  - tests/fixtures/board/
  - tests/verbs.test.ts
  - tasks/T158/PLAN.md
tests_frozen: [tests/board.test.ts, tests/fixtures/board/]
---

## Contexto
- PLAN-0012 TASK-01.
