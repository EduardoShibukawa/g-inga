---
mode: padrao
goal: "ginga events migrate converte o events.jsonl do pi-harness para o envelope v1 de forma idempotente"
done_when: "bun test tests/events_migrate.test.ts"
tests_frozen: ["tests/events_migrate.test.ts", "tests/fixtures/pi-harness-events.jsonl"]
touch: ["src/events/migrate.ts", "src/cli.ts", "tests/events_migrate.test.ts", "tests/fixtures/pi-harness-events.jsonl"]
---

## Context

- Materializada de `plans/PLAN-0004-eventos-e-lint/TASK-03-eventos-migrar.md` (passada RED do Planner).
- Repo-alvo: ginga. tests_frozen escritos pelo Planner; o Executor não os toca.
