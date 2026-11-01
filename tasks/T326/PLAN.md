---
type: task
mode: mvp
goal: "A tela Quadro mostra o kanban INTENT → FEITO com marcas de blocker, aprovação e execução e filtros por repo e trilha"
title: Tela Quadro
plan: PLAN-0012-roda-web
repo: ginga
depends_on: [TASK-02-web-shell]
tier: free
touch: [src/web/render/board.ts, web/board.js, tests/web_board.test.ts]
done_when: "bun test tests/web_board.test.ts"
tests_frozen: [tests/web_board.test.ts]
pinga_task: T326
---

## Context
- TASK-04 do PLAN-0012: renderBoard puro em src/web/render/board.ts + web/board.js. Marcas blocker/aprovacao/rodando e n/m; filtros repo/trilha na URL. So abrir o PLAN, sem outras acoes.
