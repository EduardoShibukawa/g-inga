---
mode: padrao
goal: "depois de aprovar, rejeitar ou responder no Inbox da Roda Web, a lista é relida e o item resolvido some"
touch:
  - web/inbox.js
  - tests/web_inbox_refresh.test.ts
  - tasks/T912/PLAN.md
tests_frozen: ["tests/web_inbox_refresh.test.ts"]
done_when: "bun test tests/web_inbox_refresh.test.ts tests/web_inbox_boot.test.ts tests/web_inbox_js.test.ts tests/web_inbox.test.ts"
---
# T912: Inbox relê a lista depois de uma ação

- Ao clicar em Aprovar a API respondia ok, mas o cartão continuava na tela
  até recarregar a página; o dono não sabia se a ação tinha valido.
- `loadInbox(host)` busca e monta; é usado na abertura e depois de cada verbo.
