---
mode: mvp
goal: "A CLI real `ginga handoff hook --runtime claude` despacha runHook, persiste estado/cooldown em prepare e injeta a abertura no redirect"
done_when: "bun test tests/handoff_cli_hook.test.ts"
touch:
  - src/handoff/hook.ts
  - src/verbs/handoff.ts
  - tests/handoff_cli_hook.test.ts
tests_frozen:
  - tests/handoff_cli_hook.test.ts
---

# TASK-19-handoff-hook-cli-correcao.md → T309

Contrato: .ginga/plans/PLAN-0013-handoff-e-learnings/TASK-19-handoff-hook-cli-correcao.md.
`hook` não pode ser tratado como PLAN; a saída JSON deve ser a do hook real.
`prepare` deve gravar `lastHandoffTs`, `depth` e caminho do handoff para respeitar cooldown.
`redirect` deve chamar `openSession` por padrão e devolver `decision`/`reason` do runtime.
