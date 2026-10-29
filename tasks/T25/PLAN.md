---
mode: padrao
goal: "ginga hooks install|check: instala hooks de .ginga/hooks/git/<hook> nos repos do hooks.toml, idempotente, encadeia o pré-existente (.ginga-prev depois do nosso), respeita core.hooksPath; reference-transaction bloca refs/heads/main sem MERGE_GATE=1; check sai 1 no drift"
done_when: "bun test tests/hooks_install.test.ts"
tests_frozen: [tests/hooks_install.test.ts]
touch:
  - src/hooks/
  - src/cli.ts
  - tests/hooks_install.test.ts
  - tests/fixtures/hooks/
---
## Contexto
- Red: fixture cria 2 repos git temporários + bundle temporário; cobre idempotência 2×, chaining com hook pré-existente, core.hooksPath, bloqueio de merge/ff/reset/commit em refs/heads/main sem MERGE_GATE, e check com drift.
- Subcomando `hooks install|check` no src/cli.ts, --root <dir> (default "."), parse TOML com Bun.TOML.parse.
- Sem toque em repos reais e sem ginga doctor nesta TASK (achados do gate ficam para TASK de correção se necessário).
