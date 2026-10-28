---
mode: mvp
goal: "Criar o repo ginga/ (Bun/TS) com a CLI ginga e ginga version --json"
done_when: "bun test tests/cli.test.ts"
tests_frozen: ["tests/cli.test.ts"]
touch: ["package.json", "tsconfig.json", "mise.toml", "bin/ginga.ts", "src/cli.ts", "README.md", "tests/cli.test.ts"]
---

## Context

- Materializada de `plans/PLAN-0004-eventos-e-lint/TASK-01-ginga-repo.md` (passada RED do Planner).
- Repo-alvo: ginga. tests_frozen escritos pelo Planner; o Executor não os toca.
