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

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function metricLabel(name) {
  return {
    executions: "Execuções",
    failure_rate: "Taxa de falha",
    ftpr: "FTPR",
    spent_usd: "Custo pago",
    cost_per_verified_task_usd: "Custo por TASK ok",
    escalations: "Escaladas",
    repeated_errors: "Erros repetidos",
  }[name] ?? name;
}

/** Monta um resumo DOM das métricas e das regras do vigia. */
export function mountMetrics(host, payload) {
  if (!host?.replaceChildren) return host;
  const root = element("section", "roda-metrics");
  root.setAttribute("data-metrics", "");
  root.append(element("h1", "", "Métricas"));

  const kpis = element("div", "metrics-kpis");
  const ftpr = payload?.ftpr?.all;
  const values = [
    ["executions", payload?.executions ?? 0],
    ["failure_rate", payload?.failure_rate ?? 0],
    ["ftpr", ftpr ?? 0],
    ["spent_usd", payload?.spent_usd ?? 0],
    ["cost_per_verified_task_usd", payload?.cost_per_verified_task_usd ?? 0],
    ["escalations", payload?.escalations ?? 0],
    ["repeated_errors", payload?.repeated_errors ?? 0],
  ];
  for (const [name, value] of values) {
    const card = element("article", "metrics-kpi");
    card.setAttribute("data-kpi", name.replaceAll("_", "-"));
    card.append(element("span", "metrics-kpi-label", metricLabel(name)), element("strong", "metrics-kpi-value", String(value)));
    kpis.append(card);
  }
  root.append(kpis);

  const rules = element("table", "metrics-vigia");
  rules.setAttribute("data-vigia", "");
  for (const rule of payload?.alert_metrics ?? []) {
    const row = document.createElement("tr");
    row.setAttribute("data-rule", String(rule?.rule_id ?? ""));
    for (const value of [rule?.rule_id, rule?.count, rule?.open, rule?.mttr_min ?? "—", rule?.cost_usd ?? 0]) {
      row.append(element("td", "", String(value ?? "—")));
    }
    rules.append(row);
  }
  root.append(rules);
  host.replaceChildren(root);
  return root;
}

/** Monta a tabela DOM de quota por provider. */
export function mountQuota(host, quotas) {
  if (!host?.replaceChildren) return host;
  const root = element("section", "roda-quota");
  root.setAttribute("data-quota", "");
  root.append(element("h1", "", "Quota"));
  const table = element("table", "");
  for (const quota of Array.isArray(quotas) ? quotas : []) {
    const row = document.createElement("tr");
    row.setAttribute("data-provider", String(quota?.provider ?? ""));
    for (const value of [quota?.provider, quota?.window, quota?.used_pct ?? "manual", quota?.resets_at ?? "—", quota?.source]) {
      row.append(element("td", "", String(value ?? "—")));
    }
    table.append(row);
  }
  root.append(table);
  host.replaceChildren(root);
  return root;
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
