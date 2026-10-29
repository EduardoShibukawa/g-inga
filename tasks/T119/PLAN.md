---
mode: padrao
goal: "ginga install --supervisor [--enable]: só a unit systemd do supervisor + link ~/.local/bin/ginga, sem tocar nos adaptadores"
done_when: "bun test tests/install/install_supervisor_flag.test.ts tests/install/install_supervisor.test.ts tests/install/install_bin_link.test.ts tests/bin_executable.test.ts"
touch:
  - src/install/supervisor_unit.ts
  - src/cli.ts
  - tests/install/install_supervisor_flag.test.ts
  - tasks/T119/PLAN.md
tests_frozen: [tests/install/install_supervisor_flag.test.ts]
---
## Contexto
- PLAN-0023 TASK-28 (item (f) do backlog). Contrato: .ginga/plans/PLAN-0023-vigia-e-supervisor/TASK-28-install-supervisor-flag.md.
