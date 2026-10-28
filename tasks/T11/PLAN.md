---
mode: padrao
goal: "ginga install não tem o nome pi-harness fixo: fonte e nome do plugin vêm de config/env"
touch: ["src/install/", "tests/install/plugin_param.test.ts"]
tests_frozen: ["tests/install/plugin_param.test.ts"]
done_when: "bun test tests/install/ && ! rg -n 'pi-harness' src/install"
---
# T11: plugin instalado vira parâmetro (PLAN-0006 TASK-02-plugin-parametrizado)

Materializada de `.ginga/plans/PLAN-0006-install-sai-do-pinga/TASK-02-plugin-parametrizado.md`.
