---
mode: padrao
goal: "E2E sem LLM: um PLAN approved de fixture vai de approved a done só com código (fases na ordem, receipt pass, commit na main via gate); executor que sempre falha → replan depois de 3 falhas"
done_when: "bun test tests/e2e/autonomo.test.ts"
touch:
  - tests/e2e/autonomo.test.ts
  - tests/fixtures/autonomo/
  - src/tick.ts
tests_frozen:
  - tests/e2e/autonomo.test.ts
  - tests/fixtures/autonomo/exec-ok.jsonl
  - tests/fixtures/autonomo/pi-stub.sh
  - tests/fixtures/autonomo/queue.ts
  - tests/fixtures/autonomo/judge-stub.sh
  - tests/fixtures/autonomo/replan-stub.sh
  - tests/fixtures/autonomo/merge-gate.sh
---

## Context
- PLAN-0028 TASK-08. Fixture em tests/fixtures/autonomo/ (stubs de pi/queue/judge/merge/replan) + teste e2e em tests/e2e/autonomo.test.ts.
- O tick precisa semear a fase `approved` no plan_phase para PLANs aprovados sem linha (hoje nenhum código faz isso) e ler o veredito do judge (.ginga/plans/<plan>/judge/*.json → verdict pass) para o nextAction sair de "judge" → merge → done. src/tick.ts está no touch por isso.
- [commands] do fixture: manda real (red/run) com runtime stub `pi` que escreve src/ok.txt, judge stub (pass), merge via gate do fixture, replan stub.
- Ledger temporário via PINGA_LEDGER; state.db via GINGA_STATE_DB. Sem rede, sem modelo real.
- Sem scripts de depuração fora do touch (use /tmp).
