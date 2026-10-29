---
mode: padrao
goal: "heartbeat periódico do supervisor leva o PID do filho em execução, não process.pid do supervisor"
done_when: "bun test tests/supervisor_heartbeat_pid.test.ts tests/supervisor_heartbeat_running.test.ts tests/supervisor_progress_effect.test.ts tests/supervisor_iterations.test.ts tests/serve_supervisor.test.ts"
touch:
  - src/supervisor.ts
  - tests/supervisor_heartbeat_pid.test.ts
  - tasks/T112/PLAN.md
tests_frozen: [tests/supervisor_heartbeat_pid.test.ts]
---
## Contexto
- Follow-up do judge 01:07 no PLAN-0023. Contrato em .ginga/plans/PLAN-0023-vigia-e-supervisor/TASK-21-heartbeat-pid-filho.md.
