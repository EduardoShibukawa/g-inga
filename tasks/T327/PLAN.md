---
type: task
mode: mvp
goal: "O detalhe do PLAN mostra o DAG de TASKs, tentativas, custo e log, com Retry, Escalar, Pausar e Cancelar"
title: Detalhe do PLAN
plan: PLAN-0012-roda-web
repo: ginga
depends_on: [TASK-02-web-shell]
tier: free
touch: [src/web/render/plan.ts, web/plan.js, tests/web_plan.test.ts]
done_when: "bun test tests/web_plan.test.ts"
tests_frozen: [tests/web_plan.test.ts]
pinga_task: T327
---

## Context
- TASK-05 do PLAN-0012: renderPlan puro em src/web/render/plan.ts + web/plan.js. Cabecalho (status, gasto/teto), TASKs com tentativas, botoes retry/escalate/pause/cancel, log.md embaixo. Sem stream Ao Vivo.
