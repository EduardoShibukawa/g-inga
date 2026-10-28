---
mode: mvp
goal: "ginga lint --export okf <saida> gera uma cópia OKF v0.1 do bundle"
done_when: "bun test tests/lint_okf.test.ts"
tests_frozen: ["tests/lint_okf.test.ts"]
touch: ["src/lint/okf.ts", "src/cli.ts", "tests/lint_okf.test.ts"]
---

## Context

- Materializada de `plans/PLAN-0004-eventos-e-lint/TASK-07-export-okf.md` (passada RED do Planner).
- Repo-alvo: ginga. tests_frozen escritos pelo Planner; o Executor não os toca.
