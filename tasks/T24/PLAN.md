---
mode: mvp
goal: "envelope v1: cost_usd valida como campo numérico do kind attempt (aceita número, reprova string)"
done_when: "bun test tests/events_validate_cost.test.ts"
touch: ["src/events/validate.ts", "tests/events_validate_cost.test.ts"]
tests_frozen: ["tests/events_validate_cost.test.ts"]
---

# T24: cost_usd numérico no validate (PLAN-0020-cost-usd-validation)

- Fix do achado do judge codex7 do PLAN-0004 ("validate.ts:19 omite cost_usd").
- `cost_usd` entra nos `numbers` do kind attempt; docs/events-v1.md:22 o define.
