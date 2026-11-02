---
mode: mvp
goal: "O relatório lê results.jsonl, calcula pass^k e médias por célula e decide cada hipótese pelos critérios pré-registrados"
title: Relatório e decisão
plan: PLAN-0016-validar-code-mode
repo: ginga
depends_on: [T337]
tier: free
touch: [bench/code-mode/report.ts, tests/code_mode/report.test.ts, tests/fixtures/code-mode/results.jsonl]
done_when: "bun test tests/code_mode/report.test.ts"
tests_frozen: [tests/code_mode/report.test.ts, tests/fixtures/code-mode/results.jsonl]
pinga_task: T341
---
## Context
- PLAN-0016 TASK-06 (depende da 02). decide(trials) → 6 vereditos H1..H5,H7 pelos critérios do PLAN.md; trials infra fora das médias; renderReport → markdown. Sem gráficos.
