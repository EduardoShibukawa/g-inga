---
mode: padrao
goal: "ginga lint valida relações, numeração única, PLAN com TASK, DAG sem ciclo e touch disjunto entre TASKs paralelas"
done_when: "bun test tests/lint_relations.test.ts"
tests_frozen: ["tests/lint_relations.test.ts"]
touch: ["src/lint/relations.ts", "src/lint/dag.ts", "src/lint/index.ts", "tests/lint_relations.test.ts"]
---

## Context

- Materializada de `plans/PLAN-0004-eventos-e-lint/TASK-06-lint-relacoes.md` (passada RED do Planner).
- Repo-alvo: ginga. tests_frozen escritos pelo Planner; o Executor não os toca.
