---
mode: mvp
goal: "A Roda Web mostra as telas Métricas e Quota a partir de ginga metrics e ginga quota"
done_when: "bun test tests/web_metrics.test.ts"
touch:
  - src/web/render/metrics.ts
  - src/web/render/quota.ts
  - web/metrics.js
  - tests/web_metrics.test.ts
tests_frozen:
  - tests/web_metrics.test.ts
---
## Context
- PLAN-0014 TASK-05. renderMetrics(m, rules) e renderQuota(q) são puros.
- KPIs: execuções, taxa de falha, FTPR, custo pago, custo/TASK ok, escaladas e erros repetidos.
- Falhas por motivo, custo por SPEC/PLAN/TASK e tabela do vigia (regra, abertos, MTTR, custo).
- Cada SVG tem tabela irmã posterior com os mesmos números; quota mostra provider/janela/uso/reseta/fonte.
- web/metrics.js exporta fetchMetrics(fetcher) e fetchQuota(fetcher) para /v1/verbs/metrics|quota.
