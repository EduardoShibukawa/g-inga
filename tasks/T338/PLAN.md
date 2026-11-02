---
mode: mvp
goal: "Um servidor MCP stdio expõe 12 tools de leitura sobre o snapshot, uma por operação"
title: Superfície M (MCP, uma tool por operação)
plan: PLAN-0016-validar-code-mode
repo: ginga
depends_on: [T335]
tier: free
touch: [bench/code-mode/surfaces/m.ts, bench/code-mode/surfaces/mcp_stdio.ts, tests/code_mode/surface_m.test.ts]
done_when: "bun test tests/code_mode/surface_m.test.ts"
tests_frozen: [tests/code_mode/surface_m.test.ts]
pinga_task: T338
---
## Context
- PLAN-0016 TASK-03. M_TOOLS + handle(req, snapshot); mcp_stdio.ts = JSON-RPC 2.0 mínimo sem dependência externa. Sem tool de escrita. Saída truncada em 8000 chars.
