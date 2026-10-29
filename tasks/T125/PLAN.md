---
mode: padrao
goal: "Plugin do Hermes traduz resposta na thread e slash /ginga em verbos do ginga, só para user IDs da allowlist"
done_when: "python3 -m unittest discover -s contrib/hermes-plugin -p test_inbound.py"
touch:
  - contrib/hermes-plugin/plugin.yaml
  - contrib/hermes-plugin/__init__.py
  - contrib/hermes-plugin/test_inbound.py
  - tasks/T125/PLAN.md
tests_frozen: [contrib/hermes-plugin/test_inbound.py]
---

## Contexto
- PLAN-0011 TASK-05. Contrato: .ginga/plans/PLAN-0011-verbos-api-auth/TASK-05-hermes-inbound.md.
- Implementar só contrib/hermes-plugin/__init__.py (handle/register/resolve_blocker/default_deps); o teste congelado define o contrato. Não tocar no teste.
