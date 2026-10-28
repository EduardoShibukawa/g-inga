---
mode: padrao
goal: "ginga lint lê o bundle .ginga e valida o frontmatter obrigatório de cada tipo"
done_when: "bun test tests/lint_frontmatter.test.ts"
tests_frozen: ["tests/lint_frontmatter.test.ts", "tests/fixtures/bundle-ok/index.md", "tests/fixtures/bundle-ok/intents/INTENT-0001-alpha.md", "tests/fixtures/bundle-ok/log.md", "tests/fixtures/bundle-ok/plans/PLAN-0001-alpha/PLAN.md", "tests/fixtures/bundle-ok/plans/PLAN-0001-alpha/TASK-01-first.md", "tests/fixtures/bundle-ok/plans/PLAN-0001-alpha/TASK-02-second.md", "tests/fixtures/bundle-ok/plans/PLAN-0001-alpha/log.md", "tests/fixtures/bundle-ok/specs/SPEC-0001-alpha.md", "tests/fixtures/bundle-bad/intents/INTENT-0001-bad.md", "tests/fixtures/bundle-bad/plans/PLAN-0001-bad/PLAN.md", "tests/fixtures/bundle-bad/plans/PLAN-0001-bad/TASK-01-x.md", "tests/fixtures/bundle-bad/specs/SPEC-0001-bad.md"]
touch: ["src/bundle/read.ts", "src/lint/frontmatter.ts", "src/lint/index.ts", "src/cli.ts", "tests/lint_frontmatter.test.ts", "tests/fixtures/bundle-ok/", "tests/fixtures/bundle-bad/"]
---

## Context

- Materializada de `plans/PLAN-0004-eventos-e-lint/TASK-05-lint-frontmatter.md` (passada RED do Planner).
- Repo-alvo: ginga. tests_frozen escritos pelo Planner; o Executor não os toca.
