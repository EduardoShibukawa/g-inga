---
mode: padrao
goal: "ginga serve executa ginga watch a cada tick; RED: 2 ticks com fixture no_progress geram 1 alerta"
done_when: "bun test tests/serve_watch_tick.test.ts"
touch:
  - src/serve.ts
  - src/watch/index.ts
  - tests/serve_watch_tick.test.ts
  - tasks/T37/PLAN.md
tests_frozen: [tests/serve_watch_tick.test.ts]
---

## Contexto
- Follow-up 6 do PLAN-0023 (vigia): loop do serve roda watch por tick.
- Idempotencia: alerta com mesmo dedupe_key ja emitido nao reemite.
