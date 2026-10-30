---
mode: mvp
goal: "ginga install projeta as entradas Stop e UserPromptSubmit do Claude que chamam ginga handoff hook --runtime claude, idempotente e em dry-run por padrão, e o mod ginga-handoff chama o mesmo comando"
done_when: "bun test tests/install_handoff_claude.test.ts"
touch:
  - src/install/adapters/claude.ts
  - contrib/claude-mod-handoff/
  - tests/install_handoff_claude.test.ts
tests_frozen:
  - tests/install_handoff_claude.test.ts
---

# TASK-15-adapter-claude.md → T154

Contrato: .ginga/plans/PLAN-0013-handoff-e-learnings/TASK-15-adapter-claude.md (não mudar goal/touch/done_when).
