import type { Metrics } from "../../metrics";
import type { RuleMetrics } from "../../metrics_alerts";

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    const entities: Record<string, string> = {
      "&": "&" + "amp;",
      "<": "&" + "lt;",
      ">": "&" + "gt;",
      '"': "&" + "quot;",
      "'": "&" + "#39;",
    };
    return entities[char]!;
  });
}

function finite(value: number | null | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function percent(value: number | null | undefined): string {
  return `${(finite(value) * 100).toFixed(1).replace(/\.0$/, "")}%`;
}

function usd(value: number | null | undefined): string {
  return `US$ ${finite(value).toFixed(2)}`;
}

function kpi(name: string, label: string, value: string, note: string): string {
  return `<article class="metrics-kpi">
  <span class="metrics-kpi-label">${escapeHtml(label)}</span>
  <strong class="metrics-kpi-value" data-kpi="${escapeHtml(name)}">${escapeHtml(value)}</strong>
  <span class="metrics-kpi-note">${escapeHtml(note)}</span>
</article>`;
}

function rows(values: Record<string, number>, empty = "—"): string {
  const entries = Object.entries(values ?? {}).sort(([left], [right]) => left.localeCompare(right));
  if (entries.length === 0) return `<tr><td>${escapeHtml(empty)}</td><td>0</td></tr>`;
  return entries
    .map(([name, value]) => `<tr><th scope="row">${escapeHtml(name)}</th><td>${escapeHtml(String(value))}</td></tr>`)
    .join("\n");
}

function failureChart(failures: Record<string, number>): string {
  const entries = Object.entries(failures ?? {}).sort(([left], [right]) => left.localeCompare(right));
  const max = Math.max(1, ...entries.map(([, count]) => finite(count)));
  const bars = entries
    .map(([reason, count], index) => {
      const y = 24 + index * 28;
      const width = Math.max(1, (finite(count) / max) * 160);
      return `<g class="metrics-bar">
    <text x="0" y="${y}">${escapeHtml(reason)}</text>
    <rect x="150" y="${y - 12}" width="${width}" height="16"></rect>
    <text x="320" y="${y}">${escapeHtml(String(count))}</text>
  </g>`;
    })
    .join("\n");
  const tableRows = entries.length === 0
    ? `<tr><td>—</td><td>0</td></tr>`
    : entries.map(([reason, count]) => `<tr><th scope="row">${escapeHtml(reason)}</th><td>${escapeHtml(String(count))}</td></tr>`).join("\n");

  return `<figure class="metrics-chart" data-chart="failures">
  <svg viewBox="0 0 360 220" role="img" aria-labelledby="metrics-failures-title">
    <title id="metrics-failures-title">Falhas por motivo</title>
    ${bars}
  </svg>
  <table>
    <caption>Falhas por motivo</caption>
    <thead><tr><th scope="col">Motivo</th><th scope="col">Falhas</th></tr></thead>
    <tbody>${tableRows}</tbody>
  </table>
</figure>`;
}

function costByTable(label: string, values: Record<string, number>): string {
  return `<section class="metrics-cost" data-cost-by="${escapeHtml(label.toLowerCase())}">
  <h3>Custo por ${escapeHtml(label)}</h3>
  <table>
    <thead><tr><th scope="col">${escapeHtml(label)}</th><th scope="col">Custo</th></tr></thead>
    <tbody>${rows(values)}</tbody>
  </table>
</section>`;
}

function vigiaTable(rules: RuleMetrics[]): string {
  const body = (rules ?? []).length === 0
    ? `<tr><td>—</td><td>0</td><td>0</td><td>—</td><td>US$ 0.00</td></tr>`
    : rules.map((rule) => `<tr data-rule="${escapeHtml(rule.rule_id)}">
      <th scope="row">${escapeHtml(rule.rule_id)}</th>
      <td>${escapeHtml(String(rule.count))}</td>
      <td>${escapeHtml(String(rule.open))}</td>
      <td>${rule.mttr_min === null ? "—" : escapeHtml(`${rule.mttr_min} min`)}</td>
      <td>${escapeHtml(usd(rule.cost_usd))}</td>
    </tr>`).join("\n");

  return `<section class="metrics-vigia" data-vigia>
  <h3>Vigia por regra</h3>
  <table>
    <thead><tr><th scope="col">Regra</th><th scope="col">Contagem</th><th scope="col">Abertos</th><th scope="col">MTTR</th><th scope="col">Custo</th></tr></thead>
    <tbody>${body}</tbody>
  </table>
</section>`;
}

/** HTML puro da tela de Métricas. Não consulta estado nem executa verbos. */
export function renderMetrics(metrics: Metrics, rules: RuleMetrics[]): string {
  const ftpr = metrics.ftpr ?? {};
  const failures = metrics.failures_by_reason ?? {};
  const costBy = metrics.cost_by ?? { spec: {}, plan: {}, task: {} };
  const kpis = [
    kpi("executions", "Execuções", String(finite(metrics.executions)), "tentativas no período"),
    kpi("failure-rate", "Taxa de falha", percent(metrics.failure_rate), "quota e infra incluídas"),
    kpi("ftpr", "FTPR", percent(ftpr.all), "passou na primeira tentativa"),
    kpi("spent-usd", "Custo pago", usd(metrics.spent_usd), "custo medido"),
    kpi("cost-per-verified-task-usd", "Custo por TASK ok", usd(metrics.cost_per_verified_task_usd), "por TASK verificada"),
    kpi("escalations", "Escaladas", String(finite(metrics.escalations)), "mudanças de tier"),
    kpi("repeated-errors", "Erros repetidos", String(finite(metrics.repeated_errors)), "depois de learning/lesson"),
  ].join("\n");

  const ftprRows = Object.entries(ftpr).length === 0
    ? `<tr><td>—</td><td>—</td></tr>`
    : Object.entries(ftpr).sort(([left], [right]) => left.localeCompare(right)).map(([scope, value]) => `<tr><th scope="row">${escapeHtml(scope)}</th><td>${escapeHtml(percent(value))}</td></tr>`).join("\n");

  return `<section class="roda-metrics" data-metrics aria-labelledby="metrics-title">
  <header class="metrics-header"><h1 id="metrics-title">Métricas</h1></header>
  <section class="metrics-kpis" aria-label="KPIs">${kpis}</section>
  <section class="metrics-breakdown">
    <h2>Falhas por motivo</h2>
    ${failureChart(failures)}
  </section>
  <section class="metrics-ftpr">
    <h2>FTPR por modelo e tier</h2>
    <table>
      <thead><tr><th scope="col">Escopo</th><th scope="col">FTPR</th></tr></thead>
      <tbody>${ftprRows}</tbody>
    </table>
  </section>
  <div class="metrics-costs">
    ${costByTable("SPEC", costBy.spec ?? {})}
    ${costByTable("PLAN", costBy.plan ?? {})}
    ${costByTable("TASK", costBy.task ?? {})}
  </div>
  ${vigiaTable(rules)}
</section>`;
}
