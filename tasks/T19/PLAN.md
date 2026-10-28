---
mode: padrao
goal: "state.db guarda a execução e ginga events ingest consome $GINGA_EVENTS a partir do offset salvo, sem duplicar"
touch: ["src/state/db.ts", "src/state/ingest.ts", "src/cli.ts", "tests/state_db.test.ts"]
tests_frozen: ["tests/state_db.test.ts"]
done_when: "bun test tests/state_db.test.ts"
---
# T19: state.db + ingestão de eventos (PLAN-0010 TASK-01-state-db)

Materializada de `.ginga/plans/PLAN-0010-tick-serve-notifier/TASK-01-state-db.md`.
