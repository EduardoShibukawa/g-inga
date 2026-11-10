---
mode: padrao
goal: "o ginga tick pergunta a próxima ação do PLAN ao manda ([commands].next, padrão manda next) e só cai na regra embutida quando o comando não responde"
touch:
  - src/tick.ts
  - tests/tick_next_command.test.ts
  - tasks/T910/PLAN.md
tests_frozen: ["tests/tick_next_command.test.ts"]
done_when: "MANDA_BIN=/Users/shibuka/Projetos/duh-homelab/manda bun test tests/tick_next_command.test.ts tests/tick_plan.test.ts tests/tick_plan_dir_slug.test.ts tests/tick_default_commands.test.ts tests/e2e/condutor_padrao.test.ts tests/e2e/autonomo.test.ts"
---
# T910: a decisão do próximo passo sai do ginga (dono: máquina no manda)

- O tick monta o estado (fase, TASKs, capacidade, veredito) e manda por stdin
  para `[commands].next`; a resposta é a ação em JSON.
- Padrão: `manda next` (manda T909). `next = "builtin"` ou comando que falha
  usa a regra antiga de `tick_plan.ts`, que fica como reserva.
- Fila, lease e gravação da fase no state.db continuam no ginga.
