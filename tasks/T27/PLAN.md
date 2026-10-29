---
mode: padrao
goal: "Seguir o contrato da TASK-01-doctor-hooks-drift.md (PLAN-0024): ginga doctor acusa drift dos hooks no registro ginga/hooks_drift (drift → broken/fail + exit 1; sem hooks.toml → unverified/blocked)"
done_when: "bun test tests/doctor_hooks_drift.test.ts"
touch:
  - src/hooks/index.ts
  - src/doctor.ts
  - tests/doctor_hooks_drift.test.ts
  - tasks/T27/PLAN.md
tests_frozen: [tests/doctor_hooks_drift.test.ts]
---
## Contexto
- Follow-up do judge do PLAN-0022 TASK-04 (REPORT 21:15): `src/doctor.ts` não verificava nem acusava drift dos hooks.
- Teste novo em `tests/doctor_hooks_drift.test.ts` (caixa preta, mesmo padrão de tests/doctor.test.ts); ver "Fazer" em .ginga/plans/PLAN-0024-doctor-hooks-drift/TASK-01-doctor-hooks-drift.md.
