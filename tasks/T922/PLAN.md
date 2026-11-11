---
mode: padrao
goal: "o e2e do onboarding (PLAN-0015) passa a exercitar o fluxo da branch do PLAN num repo único: init, intent, plan, approve e ticks até o merge do gate, com o trabalho chegando na main só depois do juiz"
touch:
  - tests/e2e/onboarding_no_gira.test.ts
  - tasks/T922/PLAN.md
tests_frozen: ["tests/e2e/onboarding_no_gira.test.ts"]
done_when: 'MANDA_BIN="$(git rev-parse --path-format=absolute --git-common-dir)/../../manda" bun test tests/e2e/onboarding_no_gira.test.ts tests/e2e/condutor_padrao.test.ts'
---
# T922: e2e do onboarding no fluxo novo

- O teste congelado afirmava que um único `ginga tick` deixava o arquivo na `main`. O dono decidiu que a `main` só anda pelo `manda merge`; em 11/11/2026 ele autorizou atualizar este teste.
- O gate recusou o merge do g-inga por causa dele (exit 13), e com razão: o cenário de repo único não fechava. A correção está no manda (T914).
- O cenário agora traz o teste congelado da TASK (o `manda plan` ainda não escreve esse arquivo: quem põe é o humano) e o roteamento com o pool do juiz.
- O `done_when` acha o manda vizinho pelo diretório git comum do repo, sem caminho fixo da máquina: o pinga prova e verifica num checkout isolado, de onde `../manda` não existe.
- RED: com o manda da `main` de antes do T914 este teste falha; passa depois que o T914 entra.
