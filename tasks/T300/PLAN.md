---
mode: padrao
goal: "checkCall barra leitura de segredo (caminho, shell, formato de chave) e redact troca chave por [REDACTED:regra], tudo a partir de deny.json, sem I/O além de stat/realpath"
done_when: "bun test tests/guard_core.test.ts"
touch:
  - src/guard/core.ts
  - src/guard/deny.json
  - tests/guard_core.test.ts
  - tests/fixtures/guard/cases.json
tests_frozen: [tests/guard_core.test.ts, tests/fixtures/guard/cases.json]
---

## Contexto
- PLAN-0033 TASK-01. Contrato completo (Fazer/Interface/Não fazer): .ginga/plans/PLAN-0033-guard-de-segredos/TASK-01-core-e-lista.md. Testes RED copiados byte a byte de red/ginga/ (congelados; o executor não os toca). Protótipo de referência só leitura: .ginga/plans/PLAN-0033-guard-de-segredos/ref/ginga/. Python do done_when com -B (sandbox perde PYTHONDONTWRITEBYTECODE). Sem segredo real em lugar nenhum: os testes montam chaves falsas em runtime.