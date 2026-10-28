---
mode: mvp
goal: "TASK-*.md fora do padrão recebe o erro de nome mesmo sem frontmatter válido"
touch:
  - src/lint/index.ts
  - src/lint/relations.ts
  - tests/lint_fix4.test.ts
tests_frozen: ["tests/lint_fix4.test.ts"]
done_when: "bun test tests/lint_fix4.test.ts tests/lint_fix3.test.ts tests/lint_fix2.test.ts tests/events_fix.test.ts tests/events.test.ts tests/lint_relations.test.ts"
---
# T10: fix do judge, rodada 4 (PLAN-0004 TASK-12-fix-nome-sem-frontmatter)

Materializada de `.ginga/plans/PLAN-0004-eventos-e-lint/TASK-12-fix-nome-sem-frontmatter.md`.
