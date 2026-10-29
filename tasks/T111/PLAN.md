---
mode: padrao
goal: "supervisor emite heartbeat com progressCheck periodicamente (heartbeatMs) enquanto o filho roda"
done_when: "bun test tests/supervisor_heartbeat_running.test.ts tests/supervisor_progress_effect.test.ts tests/supervisor_iterations.test.ts tests/serve_supervisor.test.ts"
touch:
  - src/supervisor.ts
  - tests/supervisor_heartbeat_running.test.ts
  - tasks/T111/PLAN.md
tests_frozen: [tests/supervisor_heartbeat_running.test.ts]
---
## Contexto
- Follow-up do judge 00:51 no PLAN-0023. Contrato em .ginga/plans/PLAN-0023-vigia-e-supervisor/TASK-20-heartbeat-periodico.md.
