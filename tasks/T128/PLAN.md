---
mode: padrao
goal: "o run do verbo init devolve JSON determinístico entre raízes: sem root/repo absolutos, para o caso init da enumeração da CLI passar"
done_when: "bun test tests/cli_verbs.test.ts"
touch:
  - src/verbs/init.ts
  - tasks/T128/PLAN.md
tests_frozen: [tests/cli_verbs.test.ts]
---

## Contexto
- PLAN-0015 TASK-06 (correção do T127). O commit RED já traz o caso `"init"` no `CASES` de `tests/cli_verbs.test.ts` (frozen T121 — alterado só por TASK nova, precedente T17→T22 em `.ginga/handoffs/REPORT-2026-10-28.d/decisoes.md`); o teste está congelado para esta task.
- Falha RED: `src/verbs/init.ts:run` devolve `{ root, repo, created, detected }` com caminhos absolutos; o laço compara o JSON da CLI (fixture A) e do `run` direto (fixture B) — diretórios temporários diferentes nunca são iguais.
- Fazer: devolver apenas `{ created, detected }`. `created` já é relativo; `detected` só nomes. Não tocar em mais nada.
- `tests/init.test.ts` (frozen T127) não congela o corpo do JSON do init.
