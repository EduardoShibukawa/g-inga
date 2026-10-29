---
mode: mvp
goal: "ginga doctor confere presença e faixa de versão de pinga, manda e gira pelo --version --json de cada um"
done_when: "bun test tests/doctor_versions.test.ts"
touch:
  - src/doctor.ts
  - tests/doctor_versions.test.ts
tests_frozen: [tests/doctor_versions.test.ts]
---

## Contexto
- PLAN-0015 TASK-05. O commit RED já traz `tests/doctor_versions.test.ts` + `gingaCompat` no
  `package.json` (dados do contrato, no base — precedente T128: o frozen muda no base).
- Fazer (em `src/doctor.ts` só): após o loop de adapters, um probe `--version --json` por bin
  (PATH via `binary()`, timeout 5 s) → registro 9 chaves harness=<bin> check="version";
  na faixa ok/pass; fora da faixa: obrigatório broken/fail+exit 1, gira (opcional) degraded/fail
  sem alterar exit; ausente ou sem `--version` (pinga real) → unverified/blocked, aviso.
- `--json` passa a `{"schema_version":1,"records":[...]}`. `doctor.test.ts` e
  `doctor_hooks_drift.test.ts` (frozen alheios) se adaptam por TASK nova (precedente T131).
- Faixas: ">=X.Y.Z"; parser próprio, sem dependências novas. Não instala nada.
