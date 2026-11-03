---
mode: padrao
goal: "o .pyc rastreado em contrib/hermes-plugin/__pycache__ sai do git (git rm --cached), para a main não sujar mais e o merge-gate não sair com 2"
done_when: "bun test tests/no_tracked_bytecode.test.ts"
touch:
  - contrib/hermes-plugin/__pycache__/__init__.cpython-314.pyc
  - tests/no_tracked_bytecode.test.ts
tests_frozen:
  - tests/no_tracked_bytecode.test.ts
---

## Contexto
- `.gitignore` já tem `__pycache__/` e `*.pyc`, mas o arquivo foi rastreado antes. Cada teste do plugin Hermes o regrava e a main fica suja.
- Fazer: `git rm --cached contrib/hermes-plugin/__pycache__/__init__.cpython-314.pyc` (o arquivo no disco pode ficar; é ignorado).
