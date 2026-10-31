---
mode: mvp
goal: "No install real (sempre passa `plugin` no ctx) o adapter Claude projeta `Stop`+`UserPromptSubmit` em settings.json com `ginga handoff hook --runtime claude`, declara as duas em `owned` e registra o mod contrib/claude-mod-handoff — idempotente"
done_when: "bun test tests/install_handoff_real.test.ts"
touch:
  - src/install/adapters/claude.ts
  - tests/install_handoff_real.test.ts
tests_frozen:
  - tests/install_handoff_real.test.ts
---

# TASK-22-adapter-claude-install-real.md → T312

Contrato: .ginga/plans/PLAN-0013-handoff-e-learnings/TASK-22-adapter-claude-install-real.md (não mudar goal/touch/done_when).
Achado do judge 2026-10-31T18:59 (gate exit 11): TASK-15 (grave) — `ensureHandoffHooks` só roda com `ctx.plugin === undefined`, mas o install real sempre passa plugin; mod não é instalado por nada; `owned` declara só `/hooks/UserPromptSubmit`.
- Projetar hooks quando `ctx.plugin === undefined` OU a fonte traz artefatos de handoff (`<source>/skills/handoff/SKILL.md` ou `<source>/contrib/claude-mod-handoff/.claude-plugin/plugin.json`); `owned` declara `/hooks/Stop` e `/hooks/UserPromptSubmit`.
- Registrar o mod em `installed_plugins.json` (`<nome>@<market>`, installPath = `<source>/contrib/claude-mod-handoff`) e em `enabledPlugins`, com `owned`/`volatile` do mod declarados.
- Fonte sem artefatos de handoff continua sem projetar hooks (tests/install/install.test.ts frozen exige hooks inalterado).
- RED: tests/install_handoff_real.test.ts falha hoje (apply real não grava os hooks; mod não registrado).
