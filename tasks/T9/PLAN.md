---
mode: mvp
goal: "Validador recusa datas de calendário impossíveis e o lint marca TASK-*.md fora do padrão mesmo sem type: task"
touch:
  - src/events/validate.ts
  - src/lint/index.ts
  - src/lint/relations.ts
  - tests/lint_fix3.test.ts
tests_frozen: ["tests/lint_fix3.test.ts"]
done_when: "bun test tests/lint_fix3.test.ts tests/lint_fix2.test.ts tests/events_fix.test.ts tests/events.test.ts tests/lint_relations.test.ts"
---
# T9: fix do judge, rodada 3 (PLAN-0004-eventos-e-lint TASK-11-fix-data-e-task-sem-type)

Materializada de `.ginga/plans/PLAN-0004-eventos-e-lint/TASK-11-fix-data-e-task-sem-type.md`.
