---
mode: padrao
goal: "ginga handoff [<PLAN>] gera o mesmo arquivo para a mesma entrada, sem chamar LLM, e emite o evento handoff"
done_when: "bun test tests/handoff.test.ts"
touch:
  - src/handoff.ts
  - src/verbs/handoff.ts
  - src/verbs/registry.ts
  - tests/handoff.test.ts
  - tests/fixtures/handoff/
  - tasks/T142/PLAN.md
tests_frozen: [tests/handoff.test.ts, tests/fixtures/handoff/]
---

## Contexto
- PLAN-0013 TASK-03. Contrato: .ginga/plans/PLAN-0013-handoff-e-learnings/TASK-03-handoff.md. Depende da TASK-01 (T140) e TASK-02 (T141) — não mexa no que elas fizeram.
- Interface do PLAN.md: `buildHandoff(root, {plan?, now, git})` → `{path, markdown, tokens}`; `git: (args: string[], cwd: string) => string` é INJETADO (o teste congela a injeção — sem git real na função pura).
- Seções na ordem do doc 06 §4: objetivo/abordagem do PLAN, TASKs com estado, learnings (`descartada`/`armadilha` ANTES dos demais — o teste congela a ordem), próxima TASK aberta, `git status --short` + `git diff --stat` (pelo git injetado), blockers abertos. Estado das TASKs pode vir de `pinga queue` (spawn permitido de git/pinga) — sem fila, degrade sem crash.
- CLI: `ginga handoff [PLAN] --root R` → grava R/handoffs/HANDOFF-<AAAA-MM-DD>-<PLAN>.md com frontmatter `type: handoff` e emite evento `handoff` em $GINGA_EVENTS com `data.trigger = "boundary"` e `data.handoff_tokens` > 0 (estimativa chars/4).
- `HANDOFF_VERBS` em src/verbs/handoff.ts; em registry.ts use `...HANDOFF_VERBS` (não inline no VERBS).
- Não fazer: gatilho automático (TASK-10).
