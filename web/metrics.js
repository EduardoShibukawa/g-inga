// Cliente das telas de Métricas e Quota da Roda Web (PLAN-0014 TASK-05).
// A API devolve os modelos; este módulo apenas busca e monta a apresentação.

const METRICS_PATH = "/v1/verbs/metrics";
const QUOTA_PATH = "/v1/verbs/quota";

async function postVerb(path, fetcher = globalThis.fetch) {
  const response = await fetcher(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (!response?.ok) {
    const detail = payload?.error ?? `HTTP ${response?.status ?? "?"}`;
    throw new Error(`${path}: ${detail}`);
  }
  return payload;
}

/** Busca o payload consolidado de ginga metrics. */
export function fetchMetrics(fetcher = globalThis.fetch) {
  return postVerb(METRICS_PATH, fetcher);
}

/** Busca a lista de quotas de ginga quota. */
export function fetchQuota(fetcher = globalThis.fetch) {
  return postVerb(QUOTA_PATH, fetcher);
}

function escapeHtml(value) {
  const text = value === null || value === undefined ? "" : String(value);
  const entities = {
    "&": "&" + "amp;",
    "<": "&" + "lt;",
    ">": "&" + "gt;",
    '"': "&" + "quot;",
    "'": "&" + "#39;",
  };
  return text.replace(/[&<>"']/g, (char) => entities[char]);
}

function finite(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function percent(value) {
  return `${(finite(value) * 100).toFixed(1).replace(/\.0$/, "")}%`;
}

function usd(value) {
  return `US$ ${finite(value).toFixed(2)}`;
}

function kpi(name, label, value, note) {
  return `<article class="metrics-kpi">
  <span class="metrics-kpi-label">${escapeHtml(label)}</span>
  <strong class="metrics-kpi-value" data-kpi="${escapeHtml(name)}">${escapeHtml(value)}</strong>
  <span class="metrics-kpi-note">${escapeHtml(note)}</span>
</article>`;
}

function valueRows(values, empty = "—") {
  const entries = Object.entries(values ?? {}).sort(([left], [right]) => left.localeCompare(right));
  if (entries.length === 0) return `<tr><td>${escapeHtml(empty)}</td><td>0</td></tr>`;
  return entries
    .map(([name, value]) => `<tr><th scope="row">${escapeHtml(name)}</th><td>${escapeHtml(String(value))}</td></tr>`)
    .join("\n");
}

function failureChart(failures) {
  const entries = Object.entries(failures ?? {}).sort(([left], [right]) => left.localeCompare(right));
  const max = Math.max(1, ...entries.map(([, count]) => finite(count)));
  const bars = entries
    .map(([reason, count], index) => {
      const y = 24 + index * 28;
      const width = Math.max(1, (finite(count) / max) * 160);
      return `<g class="metrics-bar">
    <text x="0" y="${y}">${escapeHtml(reason)}</text>
    <rect x="150" y="${y - 12}" width="${width}" height="16"></rect>
    <text x="320" y="${y}">${escapeHtml(String(finite(count)))}</text>
  </g>`;
    })
    .join("\n");
  const tableRows = entries.length === 0
    ? `<tr><td>—</td><td>0</td></tr>`
    : entries.map(([reason, count]) => `<tr><th scope="row">${escapeHtml(reason)}</th><td>${escapeHtml(String(finite(count)))}</td></tr>`).join("\n");

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

function costByTable(label, values) {
  return `<section class="metrics-cost" data-cost-by="${escapeHtml(label.toLowerCase())}">
  <h3>Custo por ${escapeHtml(label)}</h3>
  <table>
    <thead><tr><th scope="col">${escapeHtml(label)}</th><th scope="col">Custo</th></tr></thead>
    <tbody>${valueRows(values)}</tbody>
  </table>
</section>`;
}

function vigiaTable(rules) {
  const list = Array.isArray(rules) ? rules : [];
  const body = list.length === 0
    ? `<tr><td>—</td><td>0</td><td>0</td><td>—</td><td>US$ 0.00</td></tr>`
    : list.map((rule) => `<tr data-rule="${escapeHtml(rule?.rule_id)}">
      <th scope="row">${escapeHtml(rule?.rule_id)}</th>
      <td>${escapeHtml(String(finite(rule?.count)))}</td>
      <td>${escapeHtml(String(finite(rule?.open)))}</td>
      <td>${rule?.mttr_min === null || rule?.mttr_min === undefined ? "—" : escapeHtml(`${rule.mttr_min} min`)}</td>
      <td>${escapeHtml(usd(rule?.cost_usd))}</td>
    </tr>`).join("\n");

  return `<section class="metrics-vigia" data-vigia>
  <h3>Vigia por regra</h3>
  <table>
    <thead><tr><th scope="col">Regra</th><th scope="col">Contagem</th><th scope="col">Abertos</th><th scope="col">MTTR</th><th scope="col">Custo</th></tr></thead>
    <tbody>${body}</tbody>
  </table>
</section>`;
}

/** HTML puro da tela de Métricas da UI web. */
export function renderMetricsHtml(metrics) {
  const payload = metrics ?? {};
  const ftpr = payload.ftpr ?? {};
  const failures = payload.failures_by_reason ?? {};
  const costBy = payload.cost_by ?? { spec: {}, plan: {}, task: {} };
  const kpis = [
    kpi("executions", "Execuções", String(finite(payload.executions)), "tentativas no período"),
    kpi("failure-rate", "Taxa de falha", percent(payload.failure_rate), "quota e infra incluídas"),
    kpi("ftpr", "FTPR", percent(ftpr.all), "passou na primeira tentativa"),
    kpi("spent-usd", "Custo pago", usd(payload.spent_usd), "custo medido"),
    kpi("cost-per-verified-task-usd", "Custo por TASK ok", usd(payload.cost_per_verified_task_usd), "por TASK verificada"),
    kpi("escalations", "Escaladas", String(finite(payload.escalations)), "mudanças de tier"),
    kpi("repeated-errors", "Erros repetidos", String(finite(payload.repeated_errors)), "depois de learning/lesson"),
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
  ${vigiaTable(payload.alert_metrics)}
</section>`;
}

function quotaUsage(quota) {
  if (quota?.used_pct === null || quota?.used_pct === undefined) {
    return quota?.source === "manual" ? "manual" : "—";
  }
  return `${finite(quota.used_pct)}%`;
}

/** HTML puro da tela de Quota da UI web. */
export function renderQuotaHtml(quotas) {
  const list = Array.isArray(quotas) ? quotas : [];
  const body = list.length === 0
    ? `<tr><td>—</td><td>—</td><td>—</td><td>—</td><td>—</td></tr>`
    : list.map((quota) => `<tr data-provider="${escapeHtml(quota?.provider)}">
      <th scope="row">${escapeHtml(quota?.provider)}</th>
      <td>${escapeHtml(quota?.window)}</td>
      <td>${escapeHtml(quotaUsage(quota))}</td>
      <td>${escapeHtml(quota?.resets_at ?? "—")}</td>
      <td>${escapeHtml(quota?.source ?? "—")}</td>
    </tr>`).join("\n");

  return `<section class="roda-quota" data-quota aria-labelledby="quota-title">
  <header class="quota-header"><h1 id="quota-title">Quota</h1></header>
  <table>
    <thead><tr><th scope="col">Provider</th><th scope="col">Janela</th><th scope="col">Uso</th><th scope="col">Reseta</th><th scope="col">Fonte</th></tr></thead>
    <tbody>${body}</tbody>
  </table>
</section>`;
}

/** Monta o dashboard de métricas no host. */
export function mountMetrics(host, payload) {
  if (!host || typeof host !== "object" || !("innerHTML" in host)) return host;
  host.innerHTML = renderMetricsHtml(payload);
  return typeof host.querySelector === "function" ? host.querySelector("[data-metrics]") ?? host : host;
}

/** Monta a tabela de quota por provider no host. */
export function mountQuota(host, quotas) {
  if (!host || typeof host !== "object" || !("innerHTML" in host)) return host;
  host.innerHTML = renderQuotaHtml(quotas);
  return typeof host.querySelector === "function" ? host.querySelector("[data-quota]") ?? host : host;
}

/** Carrega e monta as duas telas quando os hosts existem. */
export async function initMetrics(
  metricsHost = typeof document !== "undefined" ? document.querySelector("[data-metrics]") : null,
  quotaHost = typeof document !== "undefined" ? document.querySelector("[data-quota]") : null,
  fetcher = globalThis.fetch,
) {
  if (!metricsHost && !quotaHost) return null;
  const [metrics, quotas] = await Promise.all([fetchMetrics(fetcher), fetchQuota(fetcher)]);
  if (metricsHost) mountMetrics(metricsHost, metrics);
  if (quotaHost) mountQuota(quotaHost, quotas);
  return { metrics, quotas };
}

if (typeof document !== "undefined") {
  const start = () => void initMetrics();
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
}
