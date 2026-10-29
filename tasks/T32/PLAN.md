---
mode: padrao
goal: "ginga install passa a instalar contrib/systemd/ginga-supervisor.service em ~/.config/systemd/user (HOME falso); supervisor.ts emite lane.round phase end coerente quando não há pendência"
done_when: "bun test tests/install/install_supervisor.test.ts"
touch:
  - src/install/install.ts
  - src/supervisor.ts
  - contrib/systemd/ginga-supervisor.service
  - tests/install/install_supervisor.test.ts
  - tasks/T32/PLAN.md
tests_frozen: [tests/serve_supervisor.test.ts, tests/install/install.test.ts]
---
## Contexto
- PLAN-0023 follow-up 2: install do unit systemd + evento coerente no supervisor.
