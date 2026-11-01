---
mode: padrao
goal: "Fecha o achado grave do judge na TASK-07: parseSupervisorConfig lê [supervisor] mode (padrão tick na config, passado pelo serve), spawn usa childArgv em mode tick e src/tick.ts aceita --loop/--repo em vez de exit 2"
done_when: "bun test tests/supervisor_tick_mode_wiring.test.ts tests/supervisor_tick_mode.test.ts"
touch:
  - src/supervisor.ts
  - src/serve.ts
  - src/tick.ts
  - tests/supervisor_tick_mode_wiring.test.ts
tests_frozen:
  - tests/supervisor_tick_mode_wiring.test.ts
---

## Context
- PLAN-0028 TASK-20 (achado grave do judge 2026-11-01; substitui TASK-19/T321, cujo teste frozen tinha bug do planejador e ficou blocked).
- parseSupervisorConfig devolve `mode` (padrão "tick" na config; "operador" só se escrito). SupervisorOptions ganha `mode`; no runLane `mode = opts.mode ?? "operador"` (classe sem mode = comportamento histórico); spawn em mode tick usa `childArgv({mode, repo}).join(" ")`. serve.ts passa `mode: supCfg.mode`.
- tick.ts: runTick aceita `--loop`, `--repo <r>`, `--repo=<r>`; `--repo` filtra a fila por `plan === R || plan.startsWith(R)`; `--loop` repete passadas com sleep GINGA_TICK_LOOP_MS (padrão 5000) até não haver pendência claimável (open, sem blocked_by, não dispatched/lease vivo), exit 0; GINGA_TICK_LOOP_MAX limita passadas; SIGTERM/SIGINT no loop → exit 0; flag desconhecida continua exit 2.
- No teste do supervisor, use contador de pendência POR supervisor (o bug da TASK-19 era compartilhar o contador entre dois Supervisors).
- Sem scripts de depuração fora do touch (use /tmp).
