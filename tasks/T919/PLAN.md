---
mode: mvp
goal: "no celular a navegação da Roda Web cabe em uma linha rolável: com nove seções a grade de três colunas ocupava três linhas e cobria o conteúdo"
touch:
  - web/style.css
  - tests/web_nav_mobile.test.ts
  - tasks/T919/PLAN.md
tests_frozen: ["tests/web_nav_mobile.test.ts"]
done_when: "bun test tests/web_nav_mobile.test.ts tests/web_shell.test.ts tests/web_shell_casca.test.ts tests/web_shell_install.test.ts"
---
# T919: navegação no celular com nove seções

- As telas novas (SPEC, Ledger, Onboarding) levaram a navegação de seis para nove itens.
- No celular a barra fica fixa embaixo e o corpo reserva 72px: três linhas de 48px passavam disso.
- Uma linha só, com rolagem horizontal; cada item mantém 48px de altura.
