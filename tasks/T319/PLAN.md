---
mode: padrao
goal: "O evento handoff emitido pelo --open sai com trigger e depth REAIS (das opts), nunca 'cache'/0 fixos — corrige a ressalva do judge 2026-11-01 (open.ts:83, open_claude.ts)"
done_when: "bun test tests/handoff_open_trigger.test.ts"
touch:
  - src/handoff/open.ts
  - src/handoff/open_claude.ts
  - src/verbs/handoff.ts
  - tests/handoff_open_trigger.test.ts
tests_frozen:
  - tests/handoff_open_trigger.test.ts
---

## Context
- Judge 2026-11-01 (PLAN-0013 mergeado, ressalva simples): open.ts e open_claude.ts emitem trigger "cache" e depth 0 fixos no --open.
- `OpenSessionOpts` ganha `trigger?: string` e `depth?: number`; `openSession` (claude e outros runtimes) emite `o.trigger ?? "manual"` e `o.depth ?? 0` no evento kind=handoff.
- O verbo `handoff --open` (src/verbs/handoff.ts) passa `trigger: trigger ?? "manual"` e `depth: args.depth` para o openSession; sem --open nada muda.
- Schema já aceita trigger "manual" (TASK-25); depth continua campo extra numérico.
- Sem scripts de depuração fora do touch (use /tmp).
