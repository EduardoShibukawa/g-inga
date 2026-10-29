---
mode: padrao
goal: "API e web exigem token ou IP da allowlist da tailnet; sem auth configurada, serve recusa sair de 127.0.0.1"
done_when: "bun test tests/auth.test.ts"
touch:
  - src/api/auth.ts
  - src/api/server.ts
  - src/serve.ts
  - tests/auth.test.ts
  - tasks/T124/PLAN.md
tests_frozen: [tests/auth.test.ts]
---
## Contexto
- PLAN-0011 TASK-04. Contrato: .ginga/plans/PLAN-0011-verbos-api-auth/TASK-04-auth.md.
