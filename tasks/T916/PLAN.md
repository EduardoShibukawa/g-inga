---
mode: padrao
goal: "a tela Quota da Roda Web vira Modelos e quota, como no protótipo Main: além das quotas por provider, mostra o gasto por modelo (verbo cost) e o FTPR por modelo (verbo metrics)"
touch:
  - web/models.js
  - web/index.html
  - web/style.css
  - tests/web_models.test.ts
  - tasks/T916/PLAN.md
tests_frozen: ["tests/web_models.test.ts"]
done_when: "bun test tests/web_models.test.ts tests/web_metrics_wired.test.ts tests/web_metrics_dashboard.test.ts tests/web_shell.test.ts tests/web_shell_casca.test.ts tests/web_shell_install.test.ts"
---
# T916: Modelos e quota (protótipo Main.dc.html, aba Modelos)

- Nenhum verbo novo: `cost` já dá o gasto por modelo e `metrics` o FTPR por `model:<nome>`.
- A view continua `quota` (testes congelados da casca); muda o rótulo e ganha o bloco de modelos.
- FTPR vem ordenado do maior para o menor, com barra proporcional.
- Sem dado, cada bloco diz que ainda não há execução medida, sem inventar número.
- Os tetos por TASK e por PLAN do protótipo ficam de fora: ainda não existem no ginga.
