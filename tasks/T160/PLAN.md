---
mode: padrao
goal: "ginga index gera o index.md do bundle a partir do modelo do quadro, preservando as seções de texto livre"
done_when: "bun test tests/index_md.test.ts"
touch:
  - src/index_md.ts
  - src/verbs/read.ts
  - src/serve.ts
  - src/cli.ts
  - tests/index_md.test.ts
  - tests/fixtures/index/
  - tasks/T160/PLAN.md
tests_frozen: [tests/index_md.test.ts, tests/fixtures/index/]
pinga_task: T160
pinga_root: /home/shibuka/Projetos/duh-homelab/ginga
---
