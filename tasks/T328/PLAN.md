---
type: task
mode: mvp
goal: "A Roda Web mostra os alertas do vigia com filtro por severidade, e o Inbox inclui os high e critical"
title: Painel de alertas por severidade
plan: PLAN-0012-roda-web
repo: ginga
depends_on: [TASK-03-inbox, TASK-08-status-json]
tier: free
touch: [src/web/render/alerts.ts, src/web/render/inbox.ts, web/alerts.js, tests/web_alerts.test.ts]
done_when: "bun test tests/web_alerts.test.ts"
tests_frozen: [tests/web_alerts.test.ts]
pinga_task: T328
---

## Context
- TASK-09 do PLAN-0012 (depois da TASK-03): renderAlerts puro em src/web/render/alerts.ts + web/alerts.js; filtro ?sev= mostra a severidade e as acima; renderInbox (src/web/render/inbox.ts) gera item type alerta para high/critical. Sem spans/traces.
