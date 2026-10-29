---
mode: padrao
goal: "progress do heartbeat mede efeito real (arquivos/commits/receipts), nunca iteracoes. RED: lane viva sem efeito -> progress constante -> no_progress dispara"
done_when: "bun test tests/supervisor_progress_effect.test.ts"
touch:
  - src/supervisor.ts
  - tests/supervisor_progress_effect.test.ts
  - tasks/T38/PLAN.md
tests_frozen: [tests/supervisor_progress_effect.test.ts]
---

## Contexto
- Follow-up 7 do PLAN-0023 (vigia): heartbeat progress real.
- SupervisorOptions.progressCheck opcional; default 0.
