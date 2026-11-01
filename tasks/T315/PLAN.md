---
mode: mvp
goal: "Hook de handoff enraizado no .ginga (handoff em <raiz>/handoffs com conteúdo do PLAN), model real no redirect (nunca --model \"\") e schema do evento handoff aceitando trigger idle|manual — corrige achados graves do judge em TASK-12/TASK-19 (+ TASK-11/TASK-18)"
done_when: "bun test tests/handoff_hook_raiz.test.ts tests/handoff_cli_hook.test.ts tests/handoff_hook.test.ts tests/handoff_cli_session.test.ts tests/events.test.ts"
touch:
  - src/handoff/hook.ts
  - src/handoff/policy.ts
  - src/verbs/handoff.ts
  - src/events/validate.ts
  - docs/events-v1.md
  - tests/handoff_hook_raiz.test.ts
  - tests/handoff_cli_hook.test.ts
tests_frozen:
  - tests/handoff_hook_raiz.test.ts
---

## Context
- Judge 2026-10-31T23:11 (graves): `src/handoff/hook.ts` chama `buildHandoff(cwd,…)` e grava em `<cwd>/handoffs` (fora de `.ginga`; sem `plans/` na raiz o handoff sai sem conteúdo do PLAN) e passa `model: ""` no redirect (`claude --model ""`). O evento `handoff` com `trigger idle|manual` (CLI de sessão, src/verbs/handoff.ts) é descartado pelo ingest porque `src/events/validate.ts` só aceita `boundary|context|cache`.
- Raiz: `resolveBundleRoot(cwd)` sobe diretórios a partir do `cwd` do stdin até achar um com `.ginga/`; `deps.root` (repassado por `runHookVerb` a partir de `ctx.root`) vence se existir. Usar a raiz em config (`<raiz>/project.toml`), estado (`<raiz>/state/`), `buildHandoff(raiz,…)` e gravação em `<raiz>/handoffs/` (path devolvido por buildHandoff).
- Model no redirect: `cfg.model ?? process.env.GINGA_MODEL ?? "sonnet"`; adicionar `model?: string` ao `HandoffCfg` e parsear `[handoff] model` em policy.ts.
- Schema: enum de `trigger` do kind `handoff` em validate.ts vira `boundary|context|cache|idle|manual`; docs/events-v1.md atualizado.
- `tests/handoff_cli_hook.test.ts` é nossa (frozen da T309) e é atualizada neste RED: handoffs em `fx.dir/.ginga/handoffs` e argv do `claude` falso gravado para exigir `--model` não vazio.
- Não tocar nos demais frozen; não corrigir o evento fixo do `--open` (TASK-13) nem o Inbox "promover?" (TASK-05). Sem scripts de depuração fora do touch (use /tmp).
