---
mode: mvp
goal: "ginga lessons import <arquivo> converte o LESSONS.md da raiz e as propostas do pinga em LESSON-*.md, sem duplicar"
done_when: "bun test tests/lessons_import.test.ts"
touch:
  - src/lessons.ts
  - src/lessons_import.ts
  - src/verbs/learning.ts
  - tests/lessons_import.test.ts
  - tests/fixtures/lessons-import/
tests_frozen:
  - tests/fixtures/lessons-import/LESSONS-PROPOSED.md
  - tests/fixtures/lessons-import/LESSONS.md
  - tests/lessons_import.test.ts
---

# TASK-08-lessons-import.md → T148

Contrato: .ginga/plans/PLAN-0013-handoff-e-learnings/TASK-08-lessons-import.md (não mudar goal/touch/done_when).
