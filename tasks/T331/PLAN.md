---
type: task
mode: padrao
goal: "Verbo `index` registrado na CLI com `--check` (exit 1 se desatualizado) e o serve regenera .ginga/index.md a cada tick/transition"
title: Verbo index ligado (follow-up do judge na TASK-06)
plan: PLAN-0012-roda-web
repo: ginga
depends_on: [TASK-06-index-gerado]
tier: free
touch: [src/verbs/registry.ts, src/verbs/index.ts, src/index_md.ts, src/serve.ts, tests/index_cli.test.ts, tests/fixtures/index/, tests/cli_verbs.test.ts]
done_when: "bun test tests/index_cli.test.ts"
tests_frozen: [tests/index_cli.test.ts, tests/fixtures/index/template.md]
pinga_task: T331
---

## Context
- Follow-up do judge 2026-11-01T210947: verbo `index` ausente do registro, sem
  `--check`/exit 1, serve não regenera, falta tests/fixtures/index/.
- ctx.root nos verbos é o bundle (<ws>/.ginga); writeIndex/checkIndex querem a
  raiz do workspace. No serve, regenerar em makeTickRunner após o runWatch.
## Interface
- getVerb("index") com arg bool check; runVerb index grava .ginga/index.md
  (> gerado por ginga, okf 0.1), idempotente; --check lança erro se desatualizado;
  serve regenera no evento transition (e2e no teste).
