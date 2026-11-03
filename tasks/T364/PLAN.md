---
mode: mvp
goal: "O stub de quota do tick (`src/tick.ts:593` `cap_ok: true`) passa a vir de `readQuotas`: `quotaCapOk` puro em `src/quota/index.ts` (falso quando provider automático com used_pct >= 100); tick chama `quotaCapOk(readQuotas({home, db}))`"
done_when: "bun test tests/quota_cap.test.ts tests/tick_plan.test.ts tests/tick.test.ts"
touch:
  - src/tick.ts
  - src/quota/index.ts
  - tests/quota_cap.test.ts
tests_frozen:
  - tests/quota_cap.test.ts
---
## Context
- PLAN-0014 TASK-15, decisão do PLAN (emendas 2026-10-29): `ginga quota` alimenta o stub de quota do tick (PLAN-0010). Judge 2026-11-03T02:50: sem referência a quota em src/tick.ts.
- `quotaCapOk(quotas)` em src/quota/index.ts: manual/unavailable/stale nunca bloqueiam; automático com used_pct >= 100 bloqueia.
- src/tick.ts: `cap_ok: quotaCapOk(readQuotas({ home: process.env.HOME ?? homedir(), db }))` só no fluxo por fase. Não mude tick_plan.ts nem testes alheios.
- RED: quota_cap.test.ts — unidade de quotaCapOk + e2e (HOME falso com statusline esgotada → não despacha; 10% → despacha).
