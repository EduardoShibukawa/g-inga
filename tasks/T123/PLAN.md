---
mode: mvp
goal: "A triagem escolhe a trilha por critérios determinísticos e só permite promover trilha pequena para feature"
done_when: "bun test tests/triage.test.ts tests/cli_verbs.test.ts"
touch:
  - src/triage.ts
  - src/verbs/triage.ts
  - src/verbs/registry.ts
  - src/verbs/write.ts
  - tests/triage.test.ts
  - tests/cli_verbs.test.ts
  - tasks/T123/PLAN.md
tests_frozen: [tests/triage.test.ts, tests/cli_verbs.test.ts]
---
## Contexto
- PLAN-0011 TASK-07. Contrato: .ginga/plans/PLAN-0011-verbos-api-auth/TASK-07-triagem.md.
- cli_verbs.test.ts ganha o caso "triage promote" (o teste de cobertura exige 1 caso por verbo).
