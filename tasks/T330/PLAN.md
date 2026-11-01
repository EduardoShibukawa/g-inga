---
type: task
mode: mvp
goal: "web/inbox.js liga os botões do Inbox a /v1/verbs/<slug> e atualiza o contador [data-count] por SSE (/v1/events)"
title: Inbox ligado aos verbos e ao SSE (follow-up do judge)
plan: PLAN-0012-roda-web
repo: ginga
depends_on: [TASK-03-inbox]
tier: free
touch: [web/inbox.js, tests/web_inbox_js.test.ts]
done_when: "bun test tests/web_inbox_js.test.ts"
tests_frozen: [tests/web_inbox_js.test.ts]
pinga_task: T330
---

## Context
- Follow-up do judge 2026-11-01: web/inbox.js não existe (touch da TASK-03);
  botões não ligados a /v1/verbs, contador sem SSE. Contrato no TASK-13 do
  PLAN (inboxVerbRequest/invokeInboxVerb/refreshInboxCount/connectInboxSse),
  mesmo padrão de web/board.js. Não tocar na casca (TASK-12/T329) nem em src/.
