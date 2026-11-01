---
mode: mvp
goal: "Um PLAN kind: investigation com TASKs de hipótese passa pelo pinga verify (TASK e PLAN) e gera learnings"
done_when: "bun test tests/e2e/investigation.test.ts"
touch:
  - tests/e2e/investigation.test.ts
  - tests/fixtures/investigation/
tests_frozen:
  - tests/e2e/investigation.test.ts
  - tests/fixtures/investigation/ws/.ginga/intents/INTENT-0001-investigar.md
  - tests/fixtures/investigation/ws/.ginga/plans/PLAN-0001-investigacao/LEARNINGS.md
  - tests/fixtures/investigation/ws/.ginga/plans/PLAN-0001-investigacao/PLAN.md
  - tests/fixtures/investigation/ws/.ginga/plans/PLAN-0001-investigacao/TASK-01-reproduzir-red.md
  - tests/fixtures/investigation/ws/.ginga/plans/PLAN-0001-investigacao/TASK-02-hipotese-a.md
  - tests/fixtures/investigation/ws/tasks/T1/PLAN.md
  - tests/fixtures/investigation/ws/tasks/T2/PLAN.md
---

# TASK-04-e2e-investigation.md → T145

Contrato: .ginga/plans/PLAN-0013-handoff-e-learnings/TASK-04-e2e-investigation.md (não mudar goal/touch/done_when).
