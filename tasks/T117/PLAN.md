---
mode: padrao
goal: "pendingCheck padrão do supervisor conta backlog (- [ ]) + ready/<repo>.json (+ fila, se configurada); tudo vazio = no_pending"
done_when: "bun test tests/supervisor_pending_default.test.ts tests/supervisor_restart_cooldown.test.ts tests/supervisor_exit_codes.test.ts tests/supervisor_idle_cooldown.test.ts tests/supervisor_iterations.test.ts tests/supervisor_heartbeat_running.test.ts tests/supervisor_heartbeat_pid.test.ts tests/supervisor_progress_effect.test.ts tests/serve_supervisor.test.ts tests/install/install_supervisor.test.ts"
touch:
  - src/supervisor.ts
  - tests/supervisor_pending_default.test.ts
  - tasks/T117/PLAN.md
tests_frozen: [tests/supervisor_pending_default.test.ts]
---
## Contexto
- PLAN-0023 TASK-26 (item (d) do backlog). Contrato: .ginga/plans/PLAN-0023-vigia-e-supervisor/TASK-26-supervisor-pending-default.md.
