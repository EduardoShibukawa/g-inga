---
mode: padrao
goal: "A UI real web/metrics.js exibe o dashboard completo: failures_by_reason com SVG e tabela irmã, cost_by por SPEC/PLAN/TASK, FTPR, KPIs e vigia (AC-dashboard-metricas / TASK-05 reprovados pelo judge 2026-11-03T04:05)"
done_when: "bun test tests/web_metrics_dashboard.test.ts tests/web_metrics.test.ts tests/web_metrics_wired.test.ts"
touch:
  - web/metrics.js
  - tests/web_metrics_dashboard.test.ts
tests_frozen:
  - tests/web_metrics_dashboard.test.ts
---
## Context
- PLAN-0014 TASK-16, follow-up do achado grave do judge (gate 11): web/metrics.js monta só KPIs/vigia/quota e não usa os renderers puros de src/web/render.
- Adicione renderers puros exportados `renderMetricsHtml(metrics)` / `renderQuotaHtml(quotas)` em web/metrics.js (espelho de src/web/render/metrics.ts e quota.ts; o navegador não importa TS) e faça mountMetrics/mountQuota montarem por eles (host.innerHTML = ...), mantendo assinaturas e atributos data-metrics/data-quota/data-kpi/data-vigia/data-rule/data-provider.
- HTML de métricas: KPIs data-kpi, figure data-chart="failures" com <svg> + <table> irmã (mesmos números), tabela FTPR, seções data-cost-by="spec|plan|task", tabela vigia.
- Não altere fetchMetrics/fetchQuota/initMetrics (tests/web_metrics.test.ts frozen) nem web/index.html/web/app.js (TASK-13 já ligou; web_shell_casca.test.ts frozen).
