---
mode: padrao
goal: "A cobertura pública da CLI inclui quota e valida a paridade CLI×run direto"
done_when: "bun test tests/quota_cli_coverage.test.ts tests/cli_verbs.test.ts"
touch:
  - tests/cli_verbs.test.ts
  - tests/quota_cli_coverage.test.ts
tests_frozen:
  - tests/quota_cli_coverage.test.ts
---
## Context
- PLAN-0014 TASK-10: a T354 adicionou o verbo público quota sem o caso correspondente.
- O contrato CLI exige um caso por verbo do registro e compara a CLI com runVerb.
