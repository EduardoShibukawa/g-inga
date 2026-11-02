---
mode: padrao
goal: "deriveBoard calcula blocked real (blocker aberto no state.db) e manda PLAN status done para a coluna FEITO"
title: Board blocked real + PLAN done em FEITO (follow-up do judge na TASK-01)
plan: PLAN-0012-roda-web
repo: ginga
depends_on: [TASK-01-board-model]
tier: free
touch: [src/board.ts, tests/board_blocked.test.ts]
done_when: "bun test tests/board_blocked.test.ts tests/board.test.ts"
tests_frozen: [tests/board_blocked.test.ts]
pinga_task: T332
---
## Context
- Judge 2026-11-01T221449 (TASK-01): `blocked` está fixo em false (src/board.ts:204,262-281) e PLAN `done` cai na coluna PLAN, não em FEITO.
## Interface
- Card `blocked=true` quando existe evento kind=blocker sem answer cujo plan é o card; senão false.
- PLAN com `status: done` vai para `columns.FEITO`.
- Não quebrar tests/board.test.ts (frozen da T158).
