---
mode: padrao
goal: "o plugin Hermes registra pre_tool_call (retorna {action:block,message} para cat .env e cat ~/.pi/agent/auth.json, None para cat README.md) e transform_tool_result (redige chave), via bun src/guard/cli.ts, com falha fechada"
done_when: "python3 -B -I -m unittest discover -s contrib/guard/hermes -p 'test_*.py'"
touch:
  - contrib/guard/hermes/guard_segredos/__init__.py
  - contrib/guard/hermes/guard_segredos/plugin.yaml
  - contrib/guard/hermes/test_guard.py
tests_frozen: [contrib/guard/hermes/test_guard.py]
---

## Contexto
- PLAN-0033 TASK-05. Contrato completo (Fazer/Interface/Não fazer): .ginga/plans/PLAN-0033-guard-de-segredos/TASK-05-plugin-hermes.md. Testes RED copiados byte a byte de red/ginga/ (congelados; o executor não os toca). Protótipo de referência só leitura: .ginga/plans/PLAN-0033-guard-de-segredos/ref/ginga/. Python do done_when com -B (sandbox perde PYTHONDONTWRITEBYTECODE). Sem segredo real em lugar nenhum: os testes montam chaves falsas em runtime.