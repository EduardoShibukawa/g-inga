---
mode: mvp
goal: "README do ginga traz a instrução de ativar a statusline do Claude (seção que cita `contrib/claude-statusline.sh` e `~/.claude/settings.json`; ativar é ação do dono)"
done_when: "bun test tests/readme_statusline.test.ts"
touch:
  - README.md
  - tests/readme_statusline.test.ts
tests_frozen:
  - tests/readme_statusline.test.ts
---
## Context
- PLAN-0014 TASK-14, ressalva simples do judge 2026-11-03T02:50 (TASK-03): a instrução da statusline não está no README.
- Adicione a seção ao README.md do repo; o ginga não edita `~/.claude/settings.json`.
- RED: tests/readme_statusline.test.ts lê o README real e falha sem a seção.
