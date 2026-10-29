---
mode: padrao
goal: "lane que sai 0 sem progresso espera idle_cooldown_ms (padrão 10 min) antes de religar"
done_when: "bun test tests/supervisor_idle_cooldown.test.ts tests/supervisor_iterations.test.ts tests/supervisor_heartbeat_running.test.ts tests/supervisor_heartbeat_pid.test.ts tests/supervisor_progress_effect.test.ts tests/serve_supervisor.test.ts"
touch:
  - src/supervisor.ts
  - src/serve.ts
  - tests/supervisor_idle_cooldown.test.ts
  - tasks/T114/PLAN.md
tests_frozen: [tests/supervisor_idle_cooldown.test.ts]
---
## Contexto
- PLAN-0023 TASK-23 (item (a) do backlog TASK-24). Contrato: .ginga/plans/PLAN-0023-vigia-e-supervisor/TASK-23-supervisor-idle-cooldown.md.
- Opção nova `idleCooldownMs` (padrão 600000) no Supervisor e em parseSupervisorConfig (`[supervisor] idle_cooldown_ms`); serve.ts repassa.
