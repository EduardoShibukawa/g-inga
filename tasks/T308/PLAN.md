---
mode: mvp
goal: "A CLI real de handoff em modo sessão aceita --from-session, lê --notes de arquivo e infere o PLAN pela branch, state.db ou log.md"
done_when: "bun test tests/handoff_cli_session.test.ts"
touch:
  - src/cli.ts
  - src/handoff.ts
  - src/verbs/handoff.ts
  - tests/handoff_cli_session.test.ts
tests_frozen:
  - tests/handoff_cli_session.test.ts
---

# TASK-18-handoff-cli-sessao-correcao.md → T308

Contrato: .ginga/plans/PLAN-0013-handoff-e-learnings/TASK-18-handoff-cli-sessao-correcao.md.
O argv deve casar `--from-session`; `--notes <arquivo>` deve conter o texto redigido, não o caminho.
Sem PLAN explícito, inferir por branch `plan/NNNN`, depois `state.db`, depois `log.md` mais recente.
O evento e o frontmatter devem registrar o PLAN efetivamente inferido.
