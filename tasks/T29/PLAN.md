---
mode: padrao
goal: "Seguir o contrato da TASK-02-watch-rules.md (PLAN-0023): kind alert no schema v1, ginga watch avalia as 6 regras e emite alert, com teste por regra"
done_when: "bun test tests/watch_rules.test.ts"
touch:
  - src/events/validate.ts
  - src/watch/index.ts
  - src/watch/rules.ts
  - src/watch/evaluate.ts
  - src/watch/parse.ts
  - src/watch/eval.ts
  - src/watch.ts
  - src/cli.ts
  - tests/watch_rules.test.ts
  - tasks/T29/PLAN.md
tests_frozen: [tests/watch_rules.test.ts]
---
## Contexto
- TASK-02 do PLAN-0023 (vigia): avaliador de rules.toml, 6 regras, kind alert.
- Teste novo em tests/watch_rules.test.ts.
