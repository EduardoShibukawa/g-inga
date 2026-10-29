---
mode: padrao
goal: "Seguir o contrato da TASK-01-hook-ancestral-llm.md (PLAN-0025): reference-transaction recusa update de main com ancestral agente LLM mesmo com MERGE_GATE=1; install atualiza hook ginga-managed no lugar"
done_when: "bun test tests/hooks_llm_guard.test.ts"
touch:
  - tests/fixtures/hooks_llm/git/reference-transaction
  - src/hooks/index.ts
  - tests/hooks_llm_guard.test.ts
  - tasks/T101/PLAN.md
tests_frozen: [tests/hooks_llm_guard.test.ts]
---
## Contexto
- Incidente 22:48 (REPORT-2026-10-28): o operador da lane manda rodou judge e `manda merge`; o hook só olhava MERGE_GATE=1.
- Contrato completo em .ginga/plans/PLAN-0025-hooks-llm-e-stale-ready/TASK-01-hook-ancestral-llm.md.
