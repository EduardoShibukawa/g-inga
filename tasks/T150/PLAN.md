---
mode: mvp
goal: "Sem <PLAN>, ginga handoff --trigger idle infere o PLAN ou cai em git + pendências, aceita --notes, grava as 7 seções, filtra segredos, fica em até 4k tokens e repete os bytes para a mesma entrada"
done_when: "bun test tests/handoff_session.test.ts"
touch:
  - src/handoff.ts
  - src/handoff/redact.ts
  - src/verbs/handoff.ts
  - tests/handoff_session.test.ts
  - tests/fixtures/handoff-session/
tests_frozen:
  - tests/fixtures/handoff-session/bundle/index.md
  - tests/fixtures/handoff-session/bundle/notes.md
  - tests/fixtures/handoff-session/bundle/plans/PLAN-0002-rascunho/LEARNINGS.md
  - tests/fixtures/handoff-session/bundle/plans/PLAN-0002-rascunho/PLAN.md
  - tests/handoff_session.test.ts
---

# TASK-11-handoff-sessao.md → T150

Contrato: .ginga/plans/PLAN-0013-handoff-e-learnings/TASK-11-handoff-sessao.md (não mudar goal/touch/done_when).
