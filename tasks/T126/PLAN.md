---
mode: mvp
goal: "Um blocker vai para Discord e Telegram, a resposta na thread vira answer e o próximo tick volta a despachar o PLAN"
done_when: "bun test tests/e2e/blocker_flow.test.ts"
touch:
  - tests/e2e/blocker_flow.test.ts
  - contrib/hermes-plugin/__init__.py
  - tasks/T126/PLAN.md
tests_frozen: [tests/e2e/blocker_flow.test.ts]
---

## Contexto
- PLAN-0011 TASK-06. Contrato: .ginga/plans/PLAN-0011-verbos-api-auth/TASK-06-e2e-blocker.md.
- O e2e semeia plan_thread no formato do router (target completo "discord:chan-1"). O RED está em contrib/hermes-plugin/__init__.py: resolve_blocker só casa target == via e não encontra o PLAN. Corrigir o match (aceitar o target prefixado por "via:") sem quebrar contrib/hermes-plugin/test_inbound.py (que casa "discord"/"telegram" crus). Não tocar no teste congelado.
