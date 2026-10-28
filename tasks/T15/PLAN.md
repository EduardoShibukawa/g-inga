---
mode: padrao
goal: "ginga install não tem o nome pi-harness fixo: fonte e nome do plugin vêm de config/env"
done_when: "bun test tests/install/ && ! rg -n 'pi-harness' src/install"
touch:
  - src/install/
  - tests/install/plugin_param.test.ts
---

## Context
- pickSource: GINGA_PLUGIN_SOURCE -> [install].source -> erro claro.
- Nome do plugin, marketplace, arquivos derivados de [install].plugin.
