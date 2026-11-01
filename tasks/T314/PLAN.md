---
mode: mvp
goal: "lessons find devolve todas as LESSONs que casam, com title real do frontmatter, e aceita lista de caminhos no --touch (vírgula) — corrige achado grave do judge na TASK-06/T147"
done_when: "bun test tests/lessons_find_all.test.ts tests/lessons_find.test.ts"
touch:
  - src/lessons.ts
  - src/verbs/learning.ts
  - tests/lessons_find_all.test.ts
tests_frozen:
  - tests/lessons_find_all.test.ts
---

## Context
- Judge 2026-10-31T23:11 (grave): `lessonsFind` (src/verbs/learning.ts) devolve só `matched[0]` com `title: ""` e só um caminho no `--touch`; `findLessons` (src/lessons.ts) também grava `title: ""`.
- Corrigir: `findLessons` devolve `title` do frontmatter; o verbo devolve todas as LESSONs (`{id, title, path, why}`) e separa `--touch` por vírgula antes de chamar `findLessons(root, paths, repo)`.
- Não tocar em `tests/lessons_find.test.ts` (frozen da T147) nem em `src/cli.ts`. Sem scripts de depuração fora do touch (use /tmp).
