---
type: task
mode: padrao
goal: "ginga status --json pela CLI devolve o mesmo JSON do runVerb direto no processo (relógio determinístico e caminho de eventos resolvido igual nos dois lados, sem depender de $GINGA_EVENTS do ambiente)"
title: Paridade CLI × runVerb do verbo status
plan: PLAN-0012-roda-web
repo: ginga
depends_on: [TASK-10-status-json]
tier: free
touch: [src/status.ts, src/verbs/read.ts, src/cli.ts, tests/status_cli_parity.test.ts]
done_when: "bun test tests/status_cli_parity.test.ts tests/status_json.test.ts tests/cli_verbs.test.ts"
tests_frozen: [tests/status_cli_parity.test.ts]
pinga_task: T324
---

## Context
- Regressao de suite apos feat(T323): cli_verbs.test.ts (frozen PLAN-0011) falha na paridade CLI x runVerb do verbo status ($GINGA_EVENTS no subprocesso vs sem ela no processo; relogio real). Contrato: caminho de eventos = $GINGA_EVENTS ou events.jsonl no dir do state.db (db.filename); relogio padrao deterministico por db (MAX(ts) de events). WIP nao commitado em src/status.ts e src/verbs/read.ts faz parte do feat. Nao alterar tests congelados alheios (cli_verbs, status_json).
