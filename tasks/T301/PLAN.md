---
mode: padrao
goal: "guardCall/guardResult aplicam escopo (GINGA_GUARD_LANE), modos enforce|shadow|off, evento JSONL sem o segredo e falha fechada; cli.ts expõe check e redact"
done_when: "bun test tests/guard_run.test.ts"
touch:
  - src/guard/run.ts
  - src/guard/cli.ts
  - tests/guard_run.test.ts
tests_frozen: [tests/guard_run.test.ts]
---

## Contexto
- PLAN-0033 TASK-02. Contrato completo (Fazer/Interface/Não fazer): .ginga/plans/PLAN-0033-guard-de-segredos/TASK-02-run-e-cli.md. Testes RED copiados byte a byte de red/ginga/ (congelados; o executor não os toca). Protótipo de referência só leitura: .ginga/plans/PLAN-0033-guard-de-segredos/ref/ginga/. Python do done_when com -B (sandbox perde PYTHONDONTWRITEBYTECODE). Sem segredo real em lugar nenhum: os testes montam chaves falsas em runtime.