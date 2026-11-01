---
mode: mvp
goal: "A CLI real aceita `ginga handoff --open [--runtime R] [--model M] [PLAN]`: grava o handoff, chama openSession e imprime JSON {path, tokens, open, sessionRef, attachCmd}; e skills/handoff/scripts/handoff.ts parseia a saída da CLI (string) sem erro"
done_when: "bun test tests/handoff_cli_open.test.ts"
touch:
  - src/verbs/handoff.ts
  - src/handoff/open.ts
  - src/handoff/open_claude.ts
  - skills/handoff/scripts/handoff.ts
  - tests/handoff_cli_open.test.ts
tests_frozen:
  - tests/handoff_cli_open.test.ts
---

# TASK-20-handoff-cli-open.md → T310

Contrato: .ginga/plans/PLAN-0013-handoff-e-learnings/TASK-20-handoff-cli-open.md (não mudar goal/touch/done_when).
Achados do judge 2026-10-31 (gate exit 11): TASK-13 (--open não ligado à CLI, openSession sem chamador) e TASK-14 (script da skill com res.stdout.split sobre string).
- Verbo `handoff` ganha `{ name: "open", bool: true }` e `{ name: "model" }`; com --open, chama openSession e devolve {path, tokens, open, sessionRef, attachCmd}.
- Script da skill: invoca `ginga handoff --open ...` e faz parse de `res` (string), não `res.stdout`.
- RED: tests/handoff_cli_open.test.ts falha hoje (--open → "falta valor para --open" exit 2; script lança TypeError).
