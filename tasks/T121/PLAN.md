---
mode: mvp
goal: "Cada verbo do registro é chamável como ginga <verbo> com --json, sem código por verbo na CLI"
done_when: "bun test tests/cli_verbs.test.ts"
touch:
  - src/cli.ts
  - tests/cli_verbs.test.ts
  - tasks/T121/PLAN.md
tests_frozen: [tests/cli_verbs.test.ts]
---
## Contexto
- PLAN-0011 TASK-02. Contrato: .ginga/plans/PLAN-0011-verbos-api-auth/TASK-02-cli-verbos.md.
