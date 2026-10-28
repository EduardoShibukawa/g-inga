---
mode: mvp
goal: "transition.data.by aceita <papel> (qualquer papel), não só owner/system"
touch:
  - src/events/validate.ts
  - tests/events_fix2.test.ts
tests_frozen: ["tests/events_fix2.test.ts"]
done_when: "bun test tests/events_fix2.test.ts tests/events_fix.test.ts tests/events.test.ts tests/lint_fix4.test.ts tests/lint_fix3.test.ts tests/lint_fix2.test.ts tests/lint_relations.test.ts"
---
# T18: fix do judge, rodada 5, achado 1 (PLAN-0004 TASK-13-fix-by-papel)

Materializada de `.ginga/plans/PLAN-0004-eventos-e-lint/TASK-13-fix-by-papel.md`.
