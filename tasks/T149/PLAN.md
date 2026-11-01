---
mode: mvp
goal: "decideHandoff devolve none/prepare/redirect e o gatilho para cada combinação de ociosidade, contexto, profundidade e cooldown; ginga lint valida [handoff]"
done_when: "bun test tests/handoff_policy.test.ts"
touch:
  - src/handoff/policy.ts
  - src/lint/project_toml.ts
  - src/lint/index.ts
  - tests/handoff_policy.test.ts
tests_frozen:
  - tests/handoff_policy.test.ts
---

# TASK-10-handoff-politica.md → T149

Contrato: .ginga/plans/PLAN-0013-handoff-e-learnings/TASK-10-handoff-politica.md (não mudar goal/touch/done_when).
