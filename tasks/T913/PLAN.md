---
mode: padrao
goal: "a Roda Web ganha o botão + Intent (pedido cru vira INTENT pela tela, com a trilha da triagem) e os cartões do Inbox ganham estilo, como no protótipo Main"
touch:
  - web/intent.js
  - web/index.html
  - web/style.css
  - tests/web_intent.test.ts
  - tasks/T913/PLAN.md
tests_frozen: ["tests/web_intent.test.ts"]
done_when: "bun test tests/web_intent.test.ts tests/web_shell.test.ts tests/web_shell_casca.test.ts tests/web_shell_install.test.ts tests/web_inbox_js.test.ts"
---
# T913: + Intent e estilo do Inbox (protótipo Roda Web)

- O protótipo abre com "+ Intent": o dono escreve o pedido, escolhe a trilha
  (auto, feature, pequena) e a tela mostra o INTENT criado e o que a triagem decidiu.
- Na Roda real não havia como criar INTENT pela tela, só pela CLI.
- `web/intent.js` só encaminha para o verbo `intent new`; nenhuma regra na tela.
- Os cartões do Inbox estavam sem CSS: botões pequenos e tudo colado.
