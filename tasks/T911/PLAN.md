---
mode: padrao
goal: "o Inbox da Roda Web carrega as pendências ao abrir no navegador e mostra o erro quando a API falha"
touch:
  - web/inbox.js
  - tests/web_inbox_boot.test.ts
  - tasks/T911/PLAN.md
tests_frozen: ["tests/web_inbox_boot.test.ts"]
done_when: "bun test tests/web_inbox_boot.test.ts tests/web_inbox_js.test.ts tests/web_inbox.test.ts"
---
# T911: Inbox da Roda Web vazio no navegador

- `initInbox` chamava `postJson(INBOX_PATH, {})` sem a função de rede: dava
  TypeError, o `catch` montava a lista vazia e o erro sumia (não havia onde mostrar).
- No navegador o dono via "Nada esperando você" mesmo com PLAN para aprovar.
  Os testes injetavam o `fetcher` e não pegavam.
- `postJson` passa a usar `globalThis.fetch` por padrão e o painel ganha a
  linha de status para o erro aparecer.
