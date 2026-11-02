---
mode: padrao
goal: "ginga metrics conta erros repetidos: falha com o mesmo motivo e escopo depois de existir learning ou lesson sobre ele"
done_when: "bun test tests/metrics_repeat.test.ts"
touch:
  - src/metrics_repeat.ts
  - src/metrics.ts
  - tests/metrics_repeat.test.ts
tests_frozen:
  - tests/metrics_repeat.test.ts
---
## Context
- PLAN-0014 TASK-04. `repeatedErrors(db, root)` em `src/metrics_repeat.ts` → linhas `{ plan, week, repeated, reused_lessons }` (week = "YYYY-Www" ISO do ts do attempt), ordenadas por plan/week:
  - attempts com data.passed === false e failure não vazio; o touch da TASK vem do frontmatter `touch:` do `<root>/plans/PLAN-*/TASK-*.md` cujo `pinga_task` == task do evento;
  - learning de `<root>/plans/*/LEARNINGS.md` (heading `## L-NN · status · YYYY-MM-DD`, campos `- hipótese|evidência|conclusão|escopo:`) conta se a data é anterior ao attempt, algum arquivo do escopo cobre o touch (igual ou prefixo) e o `failure` aparece no texto do learning;
  - LESSON de `<root>/knowledge/lessons/LESSON-*.md` (frontmatter scope.files/tags/evidence) conta do mesmo jeito (failure em tags/evidence/title); esses contam em `reused_lessons`.
- `computeMetrics(db, { since?, root? })` em src/metrics.ts ganha o campo `repeated_errors: number` = soma dos `repeated` (0 sem root).
