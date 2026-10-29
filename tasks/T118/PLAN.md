---
mode: padrao
goal: "bin/ginga.ts versionado com modo 755; o alvo do link criado por ginga install executa"
done_when: "bun test tests/bin_executable.test.ts tests/install/install_bin_link.test.ts"
touch:
  - bin/ginga.ts
  - tests/bin_executable.test.ts
  - tasks/T118/PLAN.md
tests_frozen: [tests/bin_executable.test.ts]
---
## Contexto
- PLAN-0023 TASK-27 (item (e) do backlog). Contrato: .ginga/plans/PLAN-0023-vigia-e-supervisor/TASK-27-bin-ginga-executavel.md.
