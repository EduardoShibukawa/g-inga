---
mode: mvp
goal: "O snapshot sintético de code mode versiona os runs usados pelo Oracle e pela superfície M, de modo que os testes passem também em um checkout limpo"
title: Fixture sintético em checkout limpo
plan: PLAN-0016-validar-code-mode
repo: ginga
depends_on: [TASK-01-tasks-oracle, TASK-03-superficie-m]
tier: free
touch:
  - tests/code_mode/clean_checkout.test.ts
  - tests/fixtures/code-mode/snapshot/runs/a.log
  - tests/fixtures/code-mode/snapshot/runs/b.log
  - tests/fixtures/code-mode/snapshot/runs/c.jsonl
  - tests/fixtures/code-mode/snapshot/runs/d.jsonl
done_when: "bun test tests/code_mode/clean_checkout.test.ts tests/code_mode/oracle.test.ts tests/code_mode/surface_m.test.ts"
tests_frozen:
  - tests/code_mode/clean_checkout.test.ts
---
## Context
- Judge: `runs/` foi ignorado e o AC falha em archive limpo.
- O RED exporta o índice Git e exige os quatro fixtures sintéticos.
