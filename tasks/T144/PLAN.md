---
mode: padrao
goal: "Caso do verbo handoff no CASES do cli_verbs + retorno do verbo com path relativo ao root (determinístico entre fixtures gêmeos)"
done_when: "bun test tests/cli_verbs.test.ts tests/handoff.test.ts tests/handoff_full.test.ts"
touch:
  - src/verbs/handoff.ts
  - tests/cli_verbs.test.ts
  - tasks/T144/PLAN.md
tests_frozen: [tests/cli_verbs.test.ts]
---

## Contexto
- PLAN-0013 TASK-17 (colateral do T142): o verbo `handoff` entrou no registro sem caso no CASES de tests/cli_verbs.test.ts → 2 fail novos vs main. Precedente T131/T128: o frozen é alterado só por TASK nova; o commit RED já traz o caso `handoff: { argv: ["handoff", "PLAN-0001"], args: { plan: "PLAN-0001" } }`.
- Fix de src: o retorno do verbo devolve `path` relativo ao ctx.root (o evento data.file continua absoluto) para a comparação CLI × run direto (fixtures gêmeos em tmp dirs diferentes) dar JSON igual.
- Contrato: .ginga/plans/PLAN-0013-handoff-e-learnings/TASK-17-cli-verbs-handoff.md.
