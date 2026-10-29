---
mode: mvp
goal: "Num repo novo sem gira, ginga init + intent + tick levam uma TASK até o receipt pass do pinga"
done_when: "bun test tests/e2e/onboarding_no_gira.test.ts"
touch:
  - tests/e2e/onboarding_no_gira.test.ts
  - tests/stubs/pi
  - tests/stubs/exec-ok.jsonl
tests_frozen:
  - tests/e2e/onboarding_no_gira.test.ts
---

## Contexto
- e2e do onboarding sem gira (PLAN-0015 TASK-02): `init --yes` (provider rg), `intent new`,
  `manda plan` com stub `pi`, `approve`, `ginga tick` despachando `manda run` (stub de runtime)
  e `pinga verify` real com `--ledger` temporário até receipt pass.
- Stubs em `tests/stubs/` no formato real do `pi --mode json` (referência: manda/tests/e2e/no_gira.test.ts).
- Sem modelos reais e sem rede.
