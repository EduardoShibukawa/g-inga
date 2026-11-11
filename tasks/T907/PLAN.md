---
mode: padrao
goal: "os comandos padrão do ginga tick batem com a CLI real do manda e nenhum aponta para bash fora dos repos"
touch:
  - src/tick.ts
  - tests/tick_default_commands.test.ts
  - tasks/T907/PLAN.md
tests_frozen: ["tests/tick_default_commands.test.ts"]
done_when: "bun test tests/tick_default_commands.test.ts"
---
# T907: comandos padrão do tick (condutor único)

- `manda red {plan}` sem `--repo` saía 2; `manda run {plan} {task}` ignorava a TASK
  (a flag é `--task`); o merge apontava para `bin/merge-gate.sh`, que não está em repo nenhum.
- Padrões novos passam `--root {root}` e usam `manda merge {plan}` (manda T906).
- `DEFAULT_COMMANDS` passa a ser exportado para o teste e para o `ginga doctor`.
