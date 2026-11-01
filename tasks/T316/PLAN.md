---
mode: mvp
goal: "transcriptUsage lê o usage no formato real do transcript do Claude (message.usage), mantendo compatibilidade com usage na raiz — corrige o grave do judge 2026-11-01 (AC handoff automático / TASK-12): contextTokens -1 e lastApiTs null no uso real"
done_when: "bun test tests/handoff_transcript_real.test.ts tests/handoff_hook.test.ts"
touch:
  - src/handoff/transcript_usage.ts
  - tests/handoff_transcript_real.test.ts
tests_frozen:
  - tests/handoff_transcript_real.test.ts
---

## Context
- Judge 2026-11-01 (grave): `src/handoff/transcript_usage.ts:21` lê `event.usage` na raiz; transcript real do Claude tem `message.usage` → hook nunca dispara idle/context fora dos fixtures.
- Corrigir para `event.message?.usage ?? event.usage` (último assistant com usage vence; timestamp na raiz). Fixtures antigos (usage na raiz) continuam passando.
- Sem scripts de depuração fora do touch (use /tmp).
