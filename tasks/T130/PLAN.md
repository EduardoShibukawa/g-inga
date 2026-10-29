---
mode: padrao
goal: "O ginga tem equivalente para cada subcomando do bin/homelab, sem caminhos absolutos"
done_when: "bun test tests/homelab_parity.test.ts"
touch:
  - src/workspace.ts
  - src/verbs/ops.ts
  - src/verbs/registry.ts
  - tests/homelab_parity.test.ts
tests_frozen: [tests/homelab_parity.test.ts]
---

## Contexto
- `src/workspace.ts` novo: `findWorkspace(fromDir)` — `GINGA_WORKSPACE` vence (vazio = não
  configurado); senão sobe até o `.ginga/` mais próximo; sem ancestral com `.ginga` → erro.
- `src/verbs/ops.ts` novo: verbos `web start|stop|open|status` (→ `ginga serve`), `tui` (tuios),
  `hermes`, `hud`, `verify` (→ `pinga verify`), `maestro` (→ `pinga maestro`), `gira` (passthrough),
  `ctl` (menu gum/fzf se houver). Binários pelo PATH (`Bun.which`), nunca caminho absoluto.
- `registry.ts`: registrar os verbos novos (são superfície do registro, como os demais).
- `tests/cli_verbs.test.ts` (frozen T121) exige CASES por verbo novo: correção via TASK nova
  (precedente T127→T128), não toca aqui.
