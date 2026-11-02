---
type: task
mode: mvp
goal: "A casca real da Roda Web (web/index.html, app.js, style.css) tem nav Inbox/Quadro/PLAN, sidebar/abas, tema claro/escuro e SSE em app.js"
title: Casca real da Roda Web (follow-up do judge)
plan: PLAN-0012-roda-web
repo: ginga
depends_on: [TASK-02-web-shell]
tier: free
touch: [web/index.html, web/app.js, web/style.css, tests/web_shell_casca.test.ts]
done_when: "bun test tests/web_shell_casca.test.ts"
tests_frozen: [tests/web_shell_casca.test.ts]
pinga_task: T329
---

## Context
- Follow-up do judge 2026-11-01 (gate exit 11): web/index.html, web/app.js e
  web/style.css têm 1 byte; o teste antigo passa só com fixtures temporárias.
  O teste frozen lê os ARQUIVOS REAIS de web/. O fallback do serve já serve
  web/ — não mexer em src/. Não tocar em web/inbox.js (TASK-13/T330).
