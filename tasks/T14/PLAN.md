---
mode: padrao
goal: "O ginga tem install/adopt/adapters copiados do pinga, com os testes copiados passando"
done_when: "bun test tests/install/"
touch:
  - src/install/
  - src/cli.ts
  - tests/install/
---

## Context
- Copiar p-inga/src/{install,adopt,manifest,shadow}.ts e adapters para src/install/.
- Copiar tests de install/adopt/adapters e helpers.
- ginga install e ginga adopt com mesmos flags.
