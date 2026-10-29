---
mode: mvp
goal: "A enumeração da CLI cobre os 8 verbos de operação; a delegação resolve binários pelo PATH corrente do processo"
done_when: "bun test tests/cli_verbs.test.ts"
touch:
  - tests/cli_verbs.test.ts
  - src/workspace.ts
  - src/verbs/ops.ts
tests_frozen: [tests/cli_verbs.test.ts]
---

## Contexto
- PLAN-0015 TASK-07 (correção da T130). T130 registrou ctl/web/tui/hermes/hud/verify/maestro/gira
  sem CASES em `tests/cli_verbs.test.ts` (frozen T121; regra "todo verbo exige cobertura") → 9 fail.
- O commit RED já traz os CASES novos + `stubBin` no PATH + `via`/`bin` no laço comparador.
- Falha RED: `src/workspace.ts:binary` usa `Bun.which(name)` sem 2º argumento — bun resolve pelo
  PATH do snapshot de boot; na comparação in-process, `gira` cai no binário real (~/.local/bin) e
  sai ≠ 0, enquanto o filho CLI usa o stub e sai 0. JSON CLI ≠ run direto.
- Fazer: `Bun.which(name, { PATH: process.env.PATH ?? "" })` em `binary`. Nada mais.
