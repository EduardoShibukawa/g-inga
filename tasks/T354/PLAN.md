---
mode: mvp
goal: "A statusline grava a quota do Claude e ginga quota --json junta Claude, Codex, providers manuais e o gasto mensal"
done_when: "bun test tests/quota.test.ts"
touch:
  - contrib/claude-statusline.sh
  - src/quota/claude.ts
  - src/quota/index.ts
  - src/verbs/quota.ts
  - src/verbs/registry.ts
  - tests/quota.test.ts
tests_frozen:
  - tests/quota.test.ts
---
## Context
- PLAN-0014 TASK-03: ler a statusline do Claude, o rollout do Codex e o custo do mês.
- Usar HOME/DB temporários nos testes; providers sem leitura automática ficam manuais.
