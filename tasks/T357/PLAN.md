---
mode: padrao
goal: "O verbo público metrics entra no registro de verbos e a cobertura pública da CLI inclui metrics com paridade CLI×run direto"
done_when: "bun test tests/metrics_cli_coverage.test.ts tests/cli_verbs.test.ts"
touch:
  - src/verbs/registry.ts
  - tests/cli_verbs.test.ts
  - tests/metrics_cli_coverage.test.ts
tests_frozen:
  - tests/metrics_cli_coverage.test.ts
---
## Context
- PLAN-0014 TASK-11 (criada pelo operador, precedente TASK-09/TASK-10): a TASK-01/T356 entregou `computeMetrics` (src/metrics.ts) e o export `metrics` em `src/verbs/read.ts`, mas o touch dela não inclui `src/verbs/registry.ts`.
- Registrar o verbo: `{ name: "metrics", args: [arg("since")], write: false, run: read.metrics }` em VERBS; acrescentar o caso `metrics: { argv: ["metrics"], args: {} }` em tests/cli_verbs.test.ts (o contrato exige um caso por verbo e compara CLI×runVerb).
