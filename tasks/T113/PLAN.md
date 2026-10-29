---
mode: padrao
goal: "no_progress avalia só os heartbeats da janela recente (window_minutes), não todo o histórico"
done_when: "bun test tests/watch_no_progress_window.test.ts tests/watch_rules.test.ts tests/watch_followup8.test.ts tests/watch_followup9.test.ts tests/serve_watch_tick.test.ts tests/supervisor_heartbeat_running.test.ts tests/supervisor_progress_effect.test.ts"
touch:
  - src/watch/evaluate.ts
  - tests/watch_no_progress_window.test.ts
  - tasks/T113/PLAN.md
tests_frozen: [tests/watch_no_progress_window.test.ts]
---
## Contexto
- Follow-up do judge 01:07 no PLAN-0023. Contrato em .ginga/plans/PLAN-0023-vigia-e-supervisor/TASK-22-no-progress-janela.md.
- Implementação: em src/watch/evaluate.ts, por entidade, ref = ts do heartbeat mais novo; recorte = ts >= ref - window + último anterior ao corte (baseline); allSame/alive/span/thr+1 avaliados só no recorte.
