---
mode: mvp
goal: "Com [supervisor] mode = tick, o supervisor roda ginga tick --loop por lane em vez de um operador LLM"
done_when: "bun test tests/supervisor_tick_mode.test.ts"
touch:
  - src/supervisor.ts
  - tests/supervisor_tick_mode.test.ts
tests_frozen: [tests/supervisor_tick_mode.test.ts]
---

## Contexto
- PLAN-0028 TASK-07. `childArgv` escolhe entre `ginga tick --loop --repo <repo>` e o modo operador.
- O frozen fixa os dois argv e proíbe runtime de LLM no modo tick.
