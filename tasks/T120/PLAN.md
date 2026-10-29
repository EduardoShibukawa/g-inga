---
mode: padrao
goal: "Um registro único de verbos implementa intent new, approve, reject, answer, decide, pause, resume, retry, escalate, cancel, budget raise e as leituras (status, board, inbox, watch)"
done_when: "bun test tests/verbs.test.ts"
touch:
  - src/verbs/registry.ts
  - src/verbs/write.ts
  - src/verbs/read.ts
  - src/verbs/audit.ts
  - tests/verbs.test.ts
  - tasks/T120/PLAN.md
tests_frozen: [tests/verbs.test.ts]
---
## Contexto
- PLAN-0011 TASK-01. Contrato: .ginga/plans/PLAN-0011-verbos-api-auth/TASK-01-registro-verbos.md.
