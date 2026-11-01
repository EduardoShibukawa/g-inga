---
mode: padrao
goal: "o plugin opencode lança erro em tool.execute.before para cat .env e cat ~/.pi/agent/auth.json (tool shell), deixa cat README.md passar e redige output em tool.execute.after; fora de lane retorna {}"
done_when: "bun test tests/guard_opencode.test.ts"
touch:
  - contrib/guard/opencode.ts
  - contrib/guard/opencode-config/plugins/ginga-guard.ts
  - tests/guard_opencode.test.ts
tests_frozen: [tests/guard_opencode.test.ts]
---

## Contexto
- PLAN-0033 TASK-04. Contrato completo (Fazer/Interface/Não fazer): .ginga/plans/PLAN-0033-guard-de-segredos/TASK-04-plugin-opencode.md. Testes RED copiados byte a byte de red/ginga/ (congelados; o executor não os toca). Protótipo de referência só leitura: .ginga/plans/PLAN-0033-guard-de-segredos/ref/ginga/. Python do done_when com -B (sandbox perde PYTHONDONTWRITEBYTECODE). Sem segredo real em lugar nenhum: os testes montam chaves falsas em runtime.