---
mode: mvp
goal: "Ligar as telas Métricas e Quota na casca real da Roda Web (VIEWS com metrics/quota em web/app.js; web/index.html com script /metrics.js, nav e seções view-metrics/view-quota com hosts [data-metrics]/[data-quota])"
done_when: "bun test tests/web_metrics_wired.test.ts"
touch:
  - web/app.js
  - web/index.html
  - web/metrics.js
  - tests/web_metrics_wired.test.ts
tests_frozen:
  - tests/web_metrics_wired.test.ts
---
## Context
- PLAN-0014 TASK-13, follow-up do achado grave do judge (gate 11, 2026-11-03T00:38): TASK-05/T361 entregou renderMetrics/renderQuota/web-metrics.js, mas a casca não liga as telas.
- web/metrics.js initMetrics já monta quando os hosts [data-metrics]/[data-quota] existem; adicione as views ao VIEWS, os links na nav e as <section> dentro de <main>.
- Não altere o atributo `nav data-view="inbox|board|plan"` (web_shell_casca.test.ts é frozen) nem testes alheios.
