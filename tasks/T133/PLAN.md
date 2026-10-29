---
mode: mvp
goal: "Os frozen do doctor leem o shape novo {schema_version, records} e a semântica de --only das versões"
done_when: "bun test tests/doctor.test.ts tests/doctor_hooks_drift.test.ts"
touch:
  - tests/doctor.test.ts
  - tests/doctor_hooks_drift.test.ts
tests_frozen: [tests/doctor.test.ts, tests/doctor_hooks_drift.test.ts]
---

## Contexto
- PLAN-0015 TASK-08 (colateral da T132, que embrulhou `doctor --json` em
  `{schema_version:1, records:[...]}`). Os dois frozen liam o array cru → 8 fail na suíte.
- O commit RED traz a adaptação: parse via wrapper + `--only` afirma que os probes de
  versão não rodam com filtro. Implementação já selada em T132; sem delta de src.
- Cobertura pura (precedente T129/T76): prove-red deve dar `test_passed_on_base`; verify sela.
