---
mode: padrao
goal: "ginga status --json devolve o estado do harness (owner, PLANs com tasks/attempts/custo, alertas por severidade, fontes quebradas) e substitui o MCP harness_status"
done_when: "bun test tests/status_json.test.ts"
touch:
  - src/status.ts
  - src/alerts.ts
  - src/verbs/read.ts
  - src/cli.ts
  - tests/status_json.test.ts

tests_frozen: [tests/status_json.test.ts]
pinga_task: T323
---

## Context
- TASK-10 do PLAN-0012: mesma entrega da TASK-08, com o frozen reescrito contra o
  schema REAL do state.db (T161 superseded: o frozen antigo criava task_exec com
  plan_id/cost_usd, colunas que não existem; openStateDb já cria a tabela com
  PRIMARY KEY (plan, task) e `src/state/db.ts` está fora do touch).
- Interfaces no PLAN.md do PLAN-0012 ("Interfaces"): `buildStatus(root, db, now)` e
  `listAlerts(db, {minSeverity?, since?})`; root = raiz do bundle (plans/, specs/...).
- owner = deriveBoard(root, db).inbox; plans: tasks do task_exec, attempts/cost_usd
  somados dos eventos `attempt` (data.cost_usd); alerts nas últimas 24 h;
  broken_sources (ex.: $GINGA_EVENTS inexistente) sem abortar. Verbo `status` devolve buildStatus.
