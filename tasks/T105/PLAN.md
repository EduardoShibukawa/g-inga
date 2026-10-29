---
mode: padrao
goal: "Seguir o contrato da TASK-01-worktree-cleanup.md (PLAN-0027): vigia worktree_cleanup"
done_when: "bun test tests/watch_worktree_cleanup.test.ts"
touch:
  - src/watch/worktrees.ts
  - src/watch/index.ts
  - src/watch/rules.ts
  - tests/watch_worktree_cleanup.test.ts
  - tasks/T105/PLAN.md
tests_frozen: [tests/watch_worktree_cleanup.test.ts]
---
## Contexto
- Backlog ginga (lane r1). Contrato em .ginga/plans/PLAN-0027-limpeza-worktrees/TASK-01-worktree-cleanup.md.
