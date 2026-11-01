---
mode: mvp
goal: "`ginga install` projeta a skill de `<source>/skills/` (união com `.pi/skills/`): dry-run lista 3 destinos e `--apply` instala a skill nos 3 destinos do HOME, idempotente, sem tocar skill alheia"
done_when: "bun test tests/skill_handoff_install.test.ts"
touch:
  - src/install/install.ts
  - tests/skill_handoff_install.test.ts
tests_frozen:
  - tests/skill_handoff_install.test.ts
---

# TASK-21-skill-handoff-install.md → T311

Contrato: .ginga/plans/PLAN-0013-handoff-e-learnings/TASK-21-skill-handoff-install.md (não mudar goal/touch/done_when).
Achado do judge 2026-10-31T18:59 (gate exit 11): TASK-14 — `projectSkillsOutput` (install.ts:247) lê só `<source>/.pi/skills` e só imprime no dry-run; `--apply` não instala a skill.
- `sourceSkills(source)`: união de `<source>/skills/*` e `<source>/.pi/skills/*` com SKILL.md; `projectSkillsOutput` usa a união; dry-run imprime a projeção se houver skills em qualquer pasta.
- `--apply` instala cada skill nos 3 destinos do HOME (cópia recursiva idempotente; pula destino com SKILL.md alheio, aviso no stderr). Nos dois caminhos do apply (early-return sem dirtyFiles e caminho principal).
- `sourceHasPiSkills` continua lendo só `.pi/skills` (suíte congelada T12).
- RED: tests/skill_handoff_install.test.ts falha hoje (dry-run sem `.pi/skills` não lista nada; apply não cria os destinos).
