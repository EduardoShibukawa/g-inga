---
mode: padrao
goal: "Seguir o contrato da TASK-03-serve-supervisor.md (PLAN-0023): supervisor no ginga serve com lanes (repo+comando), backoff crescente em falha e parada sem pendência; unit ginga-supervisor em contrib/systemd; teste tests/serve_supervisor.test.ts"
done_when: "bun test tests/serve_supervisor.test.ts"
touch:
  - src/serve.ts
  - src/supervisor.ts
  - src/install/install.ts
  - src/supervise.ts
  - src/supervisor/index.ts
  - contrib/systemd/ginga-supervisor.service
  - tests/serve_supervisor.test.ts
  - tasks/T30/PLAN.md
tests_frozen: [tests/serve_supervisor.test.ts, tests/serve.test.ts]
---
## Contexto
- TASK-03 do PLAN-0023 (vigia): supervisor no serve + unit systemd.
- Teste novo em tests/serve_supervisor.test.ts (comandos falsos).
