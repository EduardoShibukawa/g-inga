---
mode: padrao
goal: "supervisor trata exit 20 (main movida: para + alerta crítico) e exit 4 (cota free: pausa 60 min sem consumir restarts)"
done_when: "bun test tests/supervisor_exit_codes.test.ts tests/supervisor_idle_cooldown.test.ts tests/supervisor_iterations.test.ts tests/supervisor_heartbeat_running.test.ts tests/supervisor_heartbeat_pid.test.ts tests/supervisor_progress_effect.test.ts tests/serve_supervisor.test.ts"
touch:
  - src/supervisor.ts
  - tests/supervisor_exit_codes.test.ts
  - tasks/T115/PLAN.md
tests_frozen: [tests/supervisor_exit_codes.test.ts]
---
## Contexto
- PLAN-0023 TASK-24 (item (b) do backlog). Contrato: .ginga/plans/PLAN-0023-vigia-e-supervisor/TASK-24-supervisor-exit-20-e-4.md.
