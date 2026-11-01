---
mode: mvp
goal: "ginga handoff --open --runtime claude monta o prompt de abertura, chama claude --bg -n ... --model ..., devolve o id em JSON e registra o evento handoff com trigger e depth"
done_when: "bun test tests/handoff_open.test.ts"
touch:
  - src/handoff/open.ts
  - src/handoff/open_claude.ts
  - tests/handoff_open.test.ts
tests_frozen:
  - tests/handoff_open.test.ts
---

# TASK-13-handoff-open.md → T152

Contrato: .ginga/plans/PLAN-0013-handoff-e-learnings/TASK-13-handoff-open.md (não mudar goal/touch/done_when).
