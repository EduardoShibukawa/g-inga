---
mode: mvp
goal: "O state.db guarda a fase de cada PLAN aprovado e toda mudança de fase emite um evento transition"
done_when: "bun test tests/plan_phase.test.ts"
touch:
  - src/plan_phase.ts
  - tests/plan_phase.test.ts
tests_frozen: [tests/plan_phase.test.ts]
---

## Contexto
- PLAN-0028 TASK-01. A fase vive em `plan_phase(plan, phase, since, replans)`.
- `getPhase`/`setPhase` usam o `Database` recebido e emitem `transition` com from/to/reason.
- `replan` incrementa `replans`; o frozen cobre approved → red → tasks e dois replans.
