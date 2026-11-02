---
mode: padrao
goal: "O runner executa cada trial num diretório novo com opencode --standalone e stdin fechado, mede tokens pelo session export e grava results.jsonl"
title: Runner de trials
plan: PLAN-0016-validar-code-mode
repo: ginga
depends_on: [T335]
tier: medium
touch: [bench/code-mode/runner.ts, bench/code-mode/run.ts, tests/code_mode/runner.test.ts, tests/fixtures/code-mode/export.json]
done_when: "bun test tests/code_mode/runner.test.ts"
tests_frozen: [tests/code_mode/runner.test.ts, tests/fixtures/code-mode/export.json]
pinga_task: T337
---
## Context
- PLAN-0016 TASK-02. run.ts exporta runCells (CLI só com import.meta.main) para o teste do teto; spawn injetado, sem modelo de verdade.
- Referência: .ginga/bench/code-mode/captura-tokens.md (session export --standalone).
