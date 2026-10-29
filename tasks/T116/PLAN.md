---
mode: padrao
goal: "estourar max_restarts com pendência espera restart_cooldown_ms (30 min) e religa sem encerrar; padrões de backoff 60 s–10 min"
done_when: "bun test tests/supervisor_restart_cooldown.test.ts tests/supervisor_exit_codes.test.ts tests/supervisor_idle_cooldown.test.ts tests/supervisor_iterations.test.ts tests/supervisor_heartbeat_running.test.ts tests/supervisor_heartbeat_pid.test.ts tests/supervisor_progress_effect.test.ts tests/serve_supervisor.test.ts tests/install/install_supervisor.test.ts"
touch:
  - src/supervisor.ts
  - src/serve.ts
  - tests/supervisor_restart_cooldown.test.ts
  - tasks/T116/PLAN.md
tests_frozen: [tests/supervisor_restart_cooldown.test.ts]
---
## Contexto
- PLAN-0023 TASK-25 (item (c) do backlog). Contrato: .ginga/plans/PLAN-0023-vigia-e-supervisor/TASK-25-supervisor-restart-cooldown.md.
