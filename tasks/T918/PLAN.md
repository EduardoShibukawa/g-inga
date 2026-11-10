---
mode: mvp
goal: "a tela da SPEC não repete as respostas: a seção Respostas que o verbo answer grava no arquivo sai de sections (as respostas já vêm estruturadas), e o Onboarding não estoura a largura com caminho longo"
touch:
  - src/verbs/spec.ts
  - web/style.css
  - tests/spec_verb_respostas.test.ts
  - tasks/T918/PLAN.md
tests_frozen: ["tests/spec_verb_respostas.test.ts"]
done_when: "bun test tests/spec_verb_respostas.test.ts tests/spec_verb.test.ts tests/web_onboarding.test.ts"
---
# T918: achados ao abrir as telas no navegador

- Responder um blocker pela tela fez a resposta aparecer duas vezes: o `answer` grava `## Respostas` no arquivo da SPEC e o verbo `spec` devolvia isso como seção livre.
- No Onboarding, o caminho comprido de um runtime alargava o painel além da tela.
