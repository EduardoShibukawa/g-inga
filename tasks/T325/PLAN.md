---
type: task
mode: mvp
goal: "A tela Inbox lista as pendências do dono com o botão da resposta mais provável e Responder livre, chamando verbos"
title: Tela Inbox
plan: PLAN-0012-roda-web
repo: ginga
depends_on: [TASK-02-web-shell]
tier: free
touch: [src/web/render/inbox.ts, web/inbox.js, tests/web_inbox.test.ts]
done_when: "bun test tests/web_inbox.test.ts"
tests_frozen: [tests/web_inbox.test.ts]
pinga_task: T325
---

## Context
- TASK-03 do PLAN-0012: renderInbox puro em src/web/render/inbox.ts + web/inbox.js. Contrato no TASK-03 (botões data-verb/data-id, contador data-count). Nao tocar em quadro/PLAN (TASK-04/05).
