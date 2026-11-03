---
mode: padrao
goal: "ginga metrics --json calcula FTPR por modelo, custo por TASK verificada e falhas por motivo a partir do state.db"
done_when: "bun test tests/metrics.test.ts"
touch:
  - src/metrics.ts
  - src/verbs/read.ts
  - tests/metrics.test.ts
  - tests/fixtures/metrics/
tests_frozen:
  - tests/metrics.test.ts
  - tests/fixtures/metrics/events.jsonl
---
## Context
- PLAN-0014 TASK-01. `computeMetrics(db, {since?})` em `src/metrics.ts` → `Metrics` (interface no PLAN.md):
  - ftpr com chaves "all", "model:<model>", "tier:<tier>"; attempts com failure quota_exhausted/infra são excluídos do FTPR (só contam em failures_by_reason); "pass de 1ª" = attempt contado com attempt_n==1 e passed=true; grupo (model/tier) vem do primeiro attempt contado da TASK.
  - cost_per_verified_task_usd = soma do custo por TASK verificada (receipt pass) / nº de verificadas; custo da TASK = soma dos eventos `cost` com task=X, e se não houver usa a soma de attempt.cost_usd (cost vence).
  - failures_by_reason (todos os failures), escalations (tier subiu entre attempts consecutivos da mesma TASK; rank free<light<medium<strong), spent_usd (todos os eventos cost), --since filtra por ts.
- O verbo público `metrics` no registro NÃO está neste touch (registry.ts fica para a TASK-11, precedente TASK-09/TASK-10); entregue só o export `metrics(ctx, args)` em `src/verbs/read.ts` que chama computeMetrics(ctx.db, {since: args.since}).
