---
mode: mvp
goal: "o cartão do Inbox que fala de uma SPEC ganha o link Abrir SPEC, que leva à tela da SPEC já aberta nela"
touch:
  - web/inbox.js
  - web/spec.js
  - web/style.css
  - tests/web_inbox_open_spec.test.ts
  - tasks/T921/PLAN.md
tests_frozen: ["tests/web_inbox_open_spec.test.ts"]
done_when: "bun test tests/web_inbox_open_spec.test.ts tests/web_inbox_js.test.ts tests/web_inbox.test.ts tests/web_inbox_boot.test.ts tests/web_inbox_refresh.test.ts tests/web_spec.test.ts"
---
# T921: do Inbox para a SPEC

- No protótipo o caminho é Inbox › SPEC-0001; na Roda a SPEC só abria pela seção SPEC.
- `specOf(item)` diz qual SPEC o cartão cita (entity ou id); cartão de PLAN ou blocker de PLAN não ganha link.
- O link é `href="#spec"` com `data-open-spec`; a tela da SPEC ouve o clique e abre aquela SPEC.
