---
mode: padrao
goal: "ginga tick conduz um PLAN de approved a mergeado com os comandos padrão num workspace real (raiz + repo dentro), e 3 falhas da TASK disparam o replan sem depender de uma fila de mentira"
touch:
  - src/tick.ts
  - tests/e2e/condutor_padrao.test.ts
  - tasks/T909/PLAN.md
tests_frozen: ["tests/e2e/condutor_padrao.test.ts"]
done_when: "MANDA_BIN=/Users/shibuka/Projetos/duh-homelab/manda bun test tests/e2e/condutor_padrao.test.ts tests/e2e/autonomo.test.ts tests/tick_plan_dir_slug.test.ts"
---
# T909: e2e do condutor com os comandos padrão

- Layout do workspace real: `.ginga/` na raiz, repo `demo/` dentro, TASK com `repo: demo`.
- Reais: `manda red|run|judge|merge`, `pinga prove-red|verify|gate|ledger verify`.
  De mentira: o executor (`pi`) e o juiz (`agy`).
- O `pinga queue` real nunca devolve `fail`; o replan passa a sair das falhas
  registradas no `task_exec` (3 tentativas com saída ≠ 0).
- MANDA_BIN no done_when: no worktree temporário do pinga o irmão ../manda não existe.
