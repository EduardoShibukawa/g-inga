---
mode: mvp
goal: "ginga lessons find --touch <caminhos> devolve as LESSONs cujo escopo cobre esses caminhos"
done_when: "bun test tests/lessons_find.test.ts"
touch:
  - src/lessons.ts
  - src/verbs/learning.ts
  - tests/lessons_find.test.ts
tests_frozen:
  - tests/lessons_find.test.ts
---

# TASK-06-lessons-find.md → T147

Contrato: .ginga/plans/PLAN-0013-handoff-e-learnings/TASK-06-lessons-find.md (não mudar goal/touch/done_when).
