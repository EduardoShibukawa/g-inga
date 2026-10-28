---
mode: padrao
goal: "Schema JSON do envelope v1, emissor O_APPEND sem efeito sem $GINGA_EVENTS e ginga events validate"
done_when: "bun test tests/events.test.ts"
tests_frozen: ["tests/events.test.ts"]
touch: ["docs/events-v1.md", "schemas/events-v1.json", "src/events/emit.ts", "src/events/validate.ts", "src/cli.ts", "tests/events.test.ts"]
---

## Context

- Materializada de `plans/PLAN-0004-eventos-e-lint/TASK-02-eventos-schema.md` (passada RED do Planner).
- Repo-alvo: ginga. tests_frozen escritos pelo Planner; o Executor não os toca.
