---
mode: mvp
goal: "ginga metrics inclui, por regra do vigia, a contagem de alertas, os abertos, o MTTR e o custo por alerta"
done_when: "bun test tests/metrics_alerts.test.ts"
touch:
  - src/metrics_alerts.ts
  - tests/metrics_alerts.test.ts
  - tests/fixtures/metrics-alerts.jsonl
tests_frozen:
  - tests/metrics_alerts.test.ts
  - tests/fixtures/metrics-alerts.jsonl
---
## Context
- PLAN-0014 TASK-08. `alertMetrics(db, {since})` → `{rule_id,count,open,mttr_min,cost_usd}[]`.
- Identidade: colunas `plan`/`task`; `data.entity` é fallback quando a entidade não tem plan/task.
- Resolvido: primeiro `receipt pass` ou `transition to=done` da mesma entidade depois do alerta.
- MTTR: média dos minutos resolvidos; `null` se a regra não tem resolução; sem resolução conta em `open`.
- Custo: eventos `cost` da mesma entidade entre alerta e resolução (ou até o fim para aberta).
- Ordenar por `count` decrescente; fixture: 3 `infra_stuck` (10 e 30 min, 1 aberta) + 1 `budget_cap`.
