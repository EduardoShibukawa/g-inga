---
mode: mvp
goal: "ginga lint valida o formato do LEARNINGS.md e aceita kind: change | investigation no PLAN"
done_when: "bun test tests/lint_learnings.test.ts"
touch:
  - src/lint/learnings.ts
  - src/lint/frontmatter.ts
  - src/lint/index.ts
  - src/cli.ts
  - tests/lint_learnings.test.ts
  - tasks/T141/PLAN.md
tests_frozen: [tests/lint_learnings.test.ts]
---

## Contexto
- PLAN-0013 TASK-02. Contrato: .ginga/plans/PLAN-0013-handoff-e-learnings/TASK-02-learnings-lint.md.
- `lintLearnings(path: string): LintIssue[]` novo em `src/lint/learnings.ts`, chamado pelo `ginga lint` (src/lint/index.ts).
- Entrada: `## L-NN · <confirmada|descartada|fato|armadilha> · AAAA-MM-DD HH:MM` com os campos `hipótese`, `evidência`, `conclusão`, `escopo`.
- Aviso (não erro): PLAN `approved` sem `LEARNINGS.md` na pasta do PLAN → `ginga lint` sai 0 e a saída menciona LEARNINGS.md; draft não gera nada sobre LEARNINGS.md. `tests/fixtures/bundle-ok` (approved, sem LEARNINGS.md) tem de continuar lintável com exit 0 nos testes existentes.
- kind: change|investigation já validado em frontmatter.ts (linha ~21) — manter; `src/cli.ts` no touch: é onde o comando `lint` imprime (aviso precisa aparecer; decisão registrada em decisoes.md).
