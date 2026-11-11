---
mode: padrao
goal: "a Roda Web ganha a tela da SPEC aberta do protótipo: o verbo spec devolve objetivo, critérios de aceite, blockers abertos e respostas; a tela deixa responder o blocker, aprovar ou pedir mudança pelos verbos que já existem"
touch:
  - src/verbs/spec.ts
  - src/verbs/registry.ts
  - web/spec.js
  - web/index.html
  - web/app.js
  - web/style.css
  - tests/spec_verb.test.ts
  - tests/web_spec.test.ts
  - tests/cli_verbs.test.ts
  - tasks/T915/PLAN.md
tests_frozen: ["tests/spec_verb.test.ts", "tests/web_spec.test.ts"]
done_when: "bun test tests/spec_verb.test.ts tests/web_spec.test.ts tests/verbs.test.ts tests/api.test.ts tests/web_shell.test.ts tests/web_shell_casca.test.ts tests/web_shell_install.test.ts"
---
# T915: tela SPEC aberta (protótipo Spec.dc.html)

- O verbo `spec <id>` só lê: frontmatter, seções do arquivo e os blockers da SPEC no state.db.
- A tela não decide nada: aprovar usa `approve`, pedir mudança usa `reject` com o motivo, responder usa `answer`.
- SPEC com blocker aberto não mostra o botão de aprovar: responde primeiro.
- O veredito do Spec Judge do protótipo ainda não tem onde morar; a tela mostra as seções que o arquivo tiver.
- `tests/cli_verbs.test.ts` só ganha o caso do verbo novo.
