---
mode: mvp
goal: "install.ts: 2º dry-run após apply imprime nada de skills; --revert remove as skills do apply; guarda A2 não trata owned sob append como homônima (TASK-22)"
done_when: "bun test tests/install_dryrun_guard.test.ts tests/install/adapters.test.ts"
touch:
  - src/install/install.ts
  - tests/install_dryrun_guard.test.ts
tests_frozen:
  - tests/install_dryrun_guard.test.ts
---

## Context
- TASK-21 (T311) fez `projectSkillsOutput` listar sempre as skills → 2º dry-run após apply imprime `=== skills ===` (quebra T13 idempotência, adapters.test.ts:195) e o apply instala skills que o --revert não remove (quebra T13 passo 5).
- TASK-22 (T312) declara `/hooks/Stop`+`/hooks/UserPromptSubmit` em `owned`; com hook alheio preexistente no evento, o laço de homônima da guarda A2 acusa exit 11. Sob prefixo `append` não há checagem de homônima (§A.4): pular esses ponteiros no laço.
- Correção só em src/install/install.ts: `projectSkillsOutput(source, home?)` lista só destinos pendentes; `removeProjectedSkills(source, home)` no revert (bytes iguais aos da fonte; alheia/symlink intactos); `checkForeign` pula owned sob append no laço de homônima.
