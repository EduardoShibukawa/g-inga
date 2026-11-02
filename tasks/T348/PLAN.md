---
mode: padrao
goal: "ginga cost sync lê o custo real das sessões no opencode.db em modo somente leitura e grava eventos cost idempotentes"
done_when: "bun test tests/cost_opencode_db.test.ts"
touch:
  - src/cost/opencode_db.ts
  - src/verbs/cost.ts
  - src/verbs/registry.ts
tests_frozen:
  - tests/cost_opencode_db.test.ts
  - tests/fixtures/opencode-db.sql
---
## Context
- PLAN-0014 TASK-07: ler session_v2/session_message, importar custo e somar por dia/modelo.
