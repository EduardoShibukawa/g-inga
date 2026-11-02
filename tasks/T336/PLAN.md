---
mode: padrao
goal: "Fallback do serve entrega o web/ da instalação do ginga quando o --root não tem web/ (num workspace real GET / mostra a Roda Web e /app.js não dá 404)"
title: Fallback do serve lê o web/ da instalação (follow-up do judge na TASK-02)
plan: PLAN-0012-roda-web
repo: ginga
depends_on: [TASK-02-web-shell]
tier: free
touch: [src/serve.ts, tests/web_shell_install.test.ts]
done_when: "bun test tests/web_shell_install.test.ts tests/web_shell.test.ts tests/web_shell_casca.test.ts"
tests_frozen: [tests/web_shell_install.test.ts]
pinga_task: T336
---
## Context
- Judge 2026-11-02 (merge-gate plan/0012 exit 11, TASK-02): o fallback lia só join(base,"web") (src/serve.ts:305); num workspace real (ex. duh-homelab/) GET / devolvia só "ginga serve" e /app.js 404. tests/web_shell.test.ts mascarava criando web/ no root temporário (frozen da T159 — não tocar).
## Interface
- webDir = <root>/web se existir (override do workspace), senão join(import.meta.dir, "..", "web") (web/ da instalação do ginga, ao lado de src/). Resto do fallback inalterado (404 p/ arquivo ausente; "ginga serve\n" só se nenhum dos dois web/ existir).
- RED novo em tests/web_shell_install.test.ts: root temporário SEM web/ → GET / devolve o index.html da instalação (nav + <title>Roda), /app.js e /style.css 200, arquivo inexistente 404; root COM web/ próprio → override continua valendo.
- Não alterar tests/web_shell.test.ts (frozen T159) nem nenhum outro frozen.
