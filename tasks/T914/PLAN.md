---
mode: padrao
goal: "a Roda Web ganha a tela Ledger e Bench do protótipo: o verbo ledger lê os receipts por [commands].ledger (padrão pinga ledger list --json) e a tela mostra cadeia, receipts da semana e a tabela com filtro por status"
touch:
  - src/verbs/ledger.ts
  - src/verbs/registry.ts
  - web/ledger.js
  - web/index.html
  - web/app.js
  - web/style.css
  - tests/ledger_verb.test.ts
  - tests/web_ledger.test.ts
  - tests/cli_verbs.test.ts
  - tasks/T914/PLAN.md
tests_frozen: ["tests/ledger_verb.test.ts", "tests/web_ledger.test.ts"]
done_when: "bun test tests/ledger_verb.test.ts tests/web_ledger.test.ts tests/verbs.test.ts tests/api.test.ts tests/web_shell.test.ts tests/web_shell_casca.test.ts tests/web_shell_install.test.ts"
---
# T914: tela Ledger e Bench (protótipo Ledger.dc.html)

- O ledger é do pinga; o ginga só lê por comando configurável, como a fila.
- O verbo soma o que a tela mostra (receipts ok em 7 dias, prove-red que não ficou RED).
- Comando que falha ou responde lixo vira `error` no payload, não exceção: a tela diz o motivo.
- A aba Bench fica com o aviso do protótipo e lista vazia: bench foi decidido para depois.
- `tests/cli_verbs.test.ts` só ganha o caso do verbo novo (regra do próprio teste).
