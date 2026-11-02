---
mode: mvp
goal: "O relatório decide H4 pelo tamanho do modelo, H7 pelo par sandbox explícito, aplica a regra de diferença sub-task e expõe uma CLI executável"
title: Critérios do relatório e CLI
plan: PLAN-0016-validar-code-mode
repo: ginga
depends_on: [TASK-02-runner, TASK-06-relatorio]
tier: free
touch:
  - bench/code-mode/report.ts
  - bench/code-mode/runner.ts
  - bench/code-mode/run.ts
  - bench/code-mode/config.ts
  - bench/code-mode/surfaces/x.ts
  - tests/code_mode/report_followup.test.ts
done_when: "bun test tests/code_mode/report_followup.test.ts tests/code_mode/report.test.ts"
tests_frozen:
  - tests/code_mode/report_followup.test.ts
---
## Context
- Judge: H4/H7 e a CLI divergem dos critérios pré-registrados.
- O RED novo cobre tamanho de modelo, sandbox explícito, regra sub-task e CLI.
