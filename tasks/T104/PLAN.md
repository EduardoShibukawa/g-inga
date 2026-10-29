---
mode: padrao
goal: "Seguir o contrato da TASK-01-install-bin-link.md (PLAN-0026): link ~/.local/bin/ginga no ginga install"
done_when: "bun test tests/install/install_bin_link.test.ts"
touch:
  - src/install/binlink.ts
  - src/install/install.ts
  - src/cli.ts
  - tests/install/install_bin_link.test.ts
  - tasks/T104/PLAN.md
tests_frozen: [tests/install/install_bin_link.test.ts]
---
## Contexto
- Backlog ginga (lane r1). Contrato em .ginga/plans/PLAN-0026-install-bin-link/TASK-01-install-bin-link.md.
