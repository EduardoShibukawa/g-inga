---
mode: padrao
goal: "a extensão Pi barra cat .env e cat ~/.pi/agent/auth.json em tool_call, deixa cat README.md passar e redige chave em tool_result; fora de lane não registra nada"
done_when: "bun test tests/guard_pi.test.ts"
touch:
  - contrib/guard/pi.ts
  - tests/guard_pi.test.ts
tests_frozen: [tests/guard_pi.test.ts]
---

## Contexto
- PLAN-0033 TASK-03. Contrato completo (Fazer/Interface/Não fazer): .ginga/plans/PLAN-0033-guard-de-segredos/TASK-03-extensao-pi.md. Testes RED copiados byte a byte de red/ginga/ (congelados; o executor não os toca). Protótipo de referência só leitura: .ginga/plans/PLAN-0033-guard-de-segredos/ref/ginga/. Python do done_when com -B (sandbox perde PYTHONDONTWRITEBYTECODE). Sem segredo real em lugar nenhum: os testes montam chaves falsas em runtime.