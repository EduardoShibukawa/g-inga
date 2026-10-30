---
mode: mvp
goal: "ginga handoff hook lê o JSON do runtime no stdin, roda decideHandoff, grava o handoff em prepare/redirect e responde no formato do Claude e do Codex, medindo o contexto pelo usage do transcript"
done_when: "bun test tests/handoff_hook.test.ts"
touch:
  - src/handoff/hook.ts
  - src/handoff/transcript_usage.ts
  - src/verbs/handoff.ts
  - tests/handoff_hook.test.ts
  - tests/fixtures/transcripts/
tests_frozen:
  - tests/fixtures/transcripts/120k.jsonl
  - tests/fixtures/transcripts/ocioso.jsonl
  - tests/fixtures/transcripts/quente.jsonl
  - tests/fixtures/transcripts/sem-usage.jsonl
  - tests/handoff_hook.test.ts
---

# TASK-12-handoff-hook.md → T151

Contrato: .ginga/plans/PLAN-0013-handoff-e-learnings/TASK-12-handoff-hook.md (não mudar goal/touch/done_when).
