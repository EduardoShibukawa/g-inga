---
mode: mvp
goal: "ginga serve entrega a casca da Roda Web em / com navegação Inbox, Quadro e PLAN, responsiva"
done_when: "bun test tests/web_shell.test.ts"
touch:
  - web/index.html
  - web/app.js
  - web/style.css
  - src/api/server.ts
  - src/serve.ts
  - tests/web_shell.test.ts
  - tasks/T159/PLAN.md
tests_frozen: [tests/web_shell.test.ts]
pinga_task: T159
pinga_root: /home/shibuka/Projetos/duh-homelab/ginga
---

## Contexto
- PLAN-0012 TASK-02. `GET /` serve `web/index.html` (com auth do PLAN-0011); `app.js` assina `/v1/events` e chama `/v1/verbs/*`. Sidebar no desktop, abas embaixo abaixo de 640px; tema claro/escuro.
- `GET /` → 200 `text/html` com `<nav data-view="inbox|board|plan">`; `/app.js`, `/style.css` → 200. Sem token → 401 (auth do PLAN-0011). Teste com `serve` em porta efêmera.
- Sem framework nem build; sem lógica de negócio no JS.
