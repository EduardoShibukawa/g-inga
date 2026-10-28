---
mode: mvp
goal: "Validador v1 exige ts ISO 8601 estrito e aceita receipt check: bdd sem ledger_n/hash"
touch:
  - src/events/validate.ts
  - tests/events_fix.test.ts
  - docs/events-v1.md
tests_frozen: ["tests/events_fix.test.ts"]
done_when: "bun test tests/events_fix.test.ts tests/events.test.ts"
---
# T7: fix do judge (PLAN-0004-eventos-e-lint TASK-08-fix-validador)

Materializada de `.ginga/plans/PLAN-0004-eventos-e-lint/TASK-08-fix-validador.md`. Achado do Verifier Judge, severidade simples.
