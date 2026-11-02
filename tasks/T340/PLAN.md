---
mode: mvp
goal: "A superfície X expõe search_tools e execute(script), com o script rodando dentro do bwrap (mínimo ou FS inteiro) e a saída truncada"
title: Superfície X (search_tools + execute no bwrap)
plan: PLAN-0016-validar-code-mode
repo: ginga
depends_on: [T335]
tier: free
touch: [bench/code-mode/surfaces/x.ts, bench/code-mode/surfaces/x1.md, tests/code_mode/surface_x.test.ts]
done_when: "bun test tests/code_mode/surface_x.test.ts"
tests_frozen: [tests/code_mode/surface_x.test.ts]
pinga_task: T340
---
## Context
- PLAN-0016 TASK-05. bwrapArgv/truncate/execute; run injetado no teste (sem bwrap real); --unshare-net; minimal = /usr + snapshot ro + tmp, senão FS inteiro ro. x1.md = instruções da 1ª versão.
