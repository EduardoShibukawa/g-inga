---
mode: mvp
goal: "Export OKF recusa saída igual ou dentro do bundle; TASK fora do padrão TASK-NN-slug é erro de lint"
touch:
  - src/lint/okf.ts
  - src/lint/relations.ts
  - src/cli.ts
  - tests/lint_fix2.test.ts
tests_frozen: ["tests/lint_fix2.test.ts"]
done_when: "bun test tests/lint_fix2.test.ts tests/lint_okf.test.ts tests/lint_relations.test.ts"
---
# T8: fix do judge, rodada 2 (PLAN-0004-eventos-e-lint TASK-10-fix-okf-e-numeracao)

Materializada de `.ginga/plans/PLAN-0004-eventos-e-lint/TASK-10-fix-okf-e-numeracao.md`.
