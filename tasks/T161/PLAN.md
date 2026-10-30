---
mode: padrao
goal: "ginga status --json devolve o estado do harness (pendências do dono, PLANs com TASKs/tentativas/custo, alertas por severidade, fontes quebradas) e substitui o MCP harness_status"
done_when: "bun test tests/status_json.test.ts"
touch:
  - src/status.ts
  - src/alerts.ts
  - src/verbs/read.ts
  - src/cli.ts
  - tests/status_json.test.ts
  - tests/fixtures/status/
tests_frozen: [tests/status_json.test.ts, tests/fixtures/status/]
pinga_task: T161
pinga_root: /home/shibuka/Projetos/duh-homelab/ginga
---
## Context
- buildStatus/listAlerts per TASK-08 spec
