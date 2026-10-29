---
mode: padrao
goal: "ginga serve expõe POST /v1/verbs/:nome e GET /v1/events (SSE) gerados do registro, com a mesma saída da CLI"
done_when: "bun test tests/api.test.ts"
touch:
  - src/api/server.ts
  - src/api/sse.ts
  - src/serve.ts
  - tests/api.test.ts
  - tasks/T122/PLAN.md
tests_frozen: [tests/api.test.ts]
---
## Contexto
- PLAN-0011 TASK-03. Contrato: .ginga/plans/PLAN-0011-verbos-api-auth/TASK-03-api-sse.md.
