---
mode: padrao
goal: "ginga metrics --json entrega ao dashboard o número de execuções, a taxa de falha, o custo por SPEC/PLAN/TASK e as métricas do vigia"
done_when: "bun test tests/metrics_dashboard_payload.test.ts"
touch:
  - src/metrics.ts
  - src/metrics_alerts.ts
  - src/verbs/read.ts
  - tests/metrics_dashboard_payload.test.ts
tests_frozen:
  - tests/metrics_dashboard_payload.test.ts
---
## Context
- PLAN-0014 TASK-12. `executions` = eventos attempt; `failure_rate` = falhas/executions.
- `cost_by` = {spec,plan,task}; SPEC vem do frontmatter plans/<PLAN>/PLAN.md; TASK = PLAN/TASK.
- `read.metrics` usa ctx.root, inclui repeated_errors e junta alert_metrics da T359.
- Banco vazio: contagens/custos zero, failure_rate zero, alert_metrics vazio.
