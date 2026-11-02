---
mode: padrao
goal: "A cobertura pública da CLI inclui cost sync e cost e valida a paridade CLI×run direto"
done_when: "bun test tests/cost_cli_coverage.test.ts tests/cli_verbs.test.ts"
touch:
  - tests/cli_verbs.test.ts
  - tests/cost_cli_coverage.test.ts
tests_frozen:
  - tests/cost_cli_coverage.test.ts
---
## Context
- PLAN-0014 TASK-09: a T348 adicionou dois verbos públicos sem os casos correspondentes.
- Use um SQLite temporário no teste; o opencode.db real é somente leitura e não deve ser usado.
