---
mode: mvp
goal: "O ginga lê a quota do Codex do último rate_limits nos rollouts e emite um evento quota"
done_when: "bun test tests/quota_codex.test.ts"
touch:
  - src/quota/codex.ts
  - tests/quota_codex.test.ts
  - tests/fixtures/codex-rollout.jsonl
tests_frozen:
  - tests/quota_codex.test.ts
  - tests/fixtures/codex-rollout.jsonl
---
## Context
- PLAN-0014 TASK-02: ler o rollout mais recente, usar o último rate_limits.primary e emitir quota.
