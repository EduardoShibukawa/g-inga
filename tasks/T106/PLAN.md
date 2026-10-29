---
mode: padrao
goal: "ginga install --revert só remove ~/.local/bin/ginga se o symlink aponta para o entrypoint do repo (preserva link do usuário)"
done_when: "bun test tests/install/install_bin_link_revert.test.ts tests/install/install_bin_link.test.ts"
touch:
  - src/install/binlink.ts
  - src/install/install.ts
  - tests/install/install_bin_link_revert.test.ts
  - tasks/T106/PLAN.md
tests_frozen: [tests/install/install_bin_link_revert.test.ts]
---
## Contexto
- Achado do judge no PLAN-0026 (regression): install.ts:700-705 remove qualquer symlink.
- Contrato em .ginga/plans/PLAN-0026-install-bin-link/TASK-02-revert-so-nosso-link.md.
