---
mode: mvp
goal: "A skill handoff na fonte única passa no ginga lint e o ginga install --dry-run lista a projeção para Claude, opencode e Pi sem tocar entrada alheia"
done_when: "bun test tests/skill_handoff.test.ts"
touch:
  - skills/handoff/SKILL.md
  - skills/handoff/scripts/handoff.ts
  - skills/handoff/references/formato.md
  - tests/skill_handoff.test.ts
tests_frozen:
  - tests/skill_handoff.test.ts
---

# TASK-14-skill-handoff.md → T153

Contrato: .ginga/plans/PLAN-0013-handoff-e-learnings/TASK-14-skill-handoff.md (não mudar goal/touch/done_when).
