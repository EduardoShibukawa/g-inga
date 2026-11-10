---
mode: padrao
goal: "o tick acha o dir do PLAN no bundle mesmo quando a fila traz o id curto (PLAN-0001) e o dir tem slug (PLAN-0001-demo)"
touch:
  - src/tick.ts
  - tests/tick_plan_dir_slug.test.ts
  - tasks/T908/PLAN.md
tests_frozen: ["tests/tick_plan_dir_slug.test.ts"]
done_when: "bun test tests/tick_plan_dir_slug.test.ts"
---
# T908: fase do PLAN com dir de slug (condutor único)

- `pinga queue` devolve `plan: PLAN-0001`; o dir real é `.ginga/plans/PLAN-0001-demo`.
- Sem achar o `PLAN.md`, o tick não semeia a fase `approved` e cai no despacho
  legado TASK a TASK: o fluxo red → tasks → judge → merge nunca começa.
- O mesmo vale para a leitura do veredito do judge.
