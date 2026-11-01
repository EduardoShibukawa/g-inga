---
mode: padrao
goal: "Fecha o achado grave do judge na TASK-07: parseSupervisorConfig lê [supervisor] mode, o supervisor chama childArgv no spawn (mode tick padrão = 'ginga tick --loop --repo <repo>') e src/tick.ts aceita --loop/--repo em vez de exit 2"
done_when: "bun test tests/supervisor_tick_loop.test.ts tests/supervisor_tick_mode.test.ts"
touch:
  - src/supervisor.ts
  - src/serve.ts
  - src/tick.ts
  - tests/supervisor_tick_loop.test.ts
tests_frozen:
  - tests/supervisor_tick_loop.test.ts
---

## Context
- PLAN-0028 TASK-19 (achado do judge 2026-11-01, grave): childArgv é código morto; [supervisor] mode não é lido; runTick rejeita --loop/--repo (exit 2).
- parseSupervisorConfig devolve `mode` (padrão "tick" após o e2e TASK-08; "operador" só se escrito). SupervisorOptions ganha `mode`; no spawn, mode tick usa `childArgv({mode, repo}).join(" ")`, operador usa lane.command. serve.ts passa `mode: supCfg.mode`.
- tick.ts: runTick aceita `--loop`, `--repo <r>`, `--repo=<r>`; `--repo` filtra a fila por `plan === R || plan.startsWith(R)`; `--loop` repete passadas com sleep GINGA_TICK_LOOP_MS (padrão 5000) até não haver pendência claimável (open, sem blocked_by, não dispatched/lease válido no task_exec), exit 0; GINGA_TICK_LOOP_MAX limita passadas; SIGTERM/SIGINT no loop → exit 0; flag desconhecida continua exit 2.
- Sem scripts de depuração fora do touch (use /tmp).
