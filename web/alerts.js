// Painel de alertas da Roda Web (PLAN-0012 TASK-09).
// A API devolve os alertas; este módulo cuida só do filtro por severidade
// refletido na URL (?sev=critical|high|warn|info — mostra a escolhida e as acima).

export const SEVERITIES = Object.freeze(["info", "warn", "high", "critical"]);

const RANK = { info: 0, warn: 1, high: 2, critical: 3 };

/** Filtro da URL: severidade mínima (padrão: todas). */
export function minSeverityFromSearch(search) {
  const sev = new URLSearchParams(search ?? "").get("sev");
  return sev && sev in RANK ? sev : undefined;
}

/** Mantém só a severidade pedida e as acima. */
export function filterBySeverity(alerts, minSeverity) {
  if (!minSeverity) return alerts;
  const floor = RANK[minSeverity];
  return alerts.filter((a) => RANK[a.severity] >= floor);
}

const ALERTS_PATH = "/v1/verbs/alerts";
const boundHosts = new WeakSet();

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function renderAlert(alert) {
  const row = element("li", "alert-row");
  row.setAttribute("data-severity", String(alert?.severity ?? ""));
  row.setAttribute("data-id", String(alert?.id ?? ""));
  if (alert?.plan) row.setAttribute("data-plan", String(alert.plan));

  row.append(
    element("span", "alert-sev", String(alert?.severity ?? "").toUpperCase()),
    element("span", "alert-rule", alert?.rule_id ?? ""),
    element("span", "alert-entity", alert?.entity ?? ""),
    element("span", "alert-summary", alert?.summary ?? ""),
    element("time", "alert-ts", alert?.ts ?? ""),
  );
  return row;
}

/** Monta o painel de alertas e atualiza a contagem da view. */
export function mountAlerts(host, alerts = [], minSeverity) {
  if (!host?.replaceChildren) return host;
  const visible = filterBySeverity(Array.isArray(alerts) ? alerts : [], minSeverity);
  const root = element("section", "roda-alerts");
  root.setAttribute("data-alerts", "");

  const header = element("header", "alerts-header");
  const count = element("span", "alerts-count", String(visible.length));
  count.setAttribute("data-count", String(visible.length));
  header.append(element("h2", "", "Alertas"), count);

  const list = element("ul", "alerts-list");
  list.setAttribute("data-alerts-list", "");
  if (visible.length === 0) list.append(element("li", "empty-state", "Nenhum alerta."));
  for (const alert of visible) list.append(renderAlert(alert));

  root.append(header, list);
  host.replaceChildren(root);
  return root;
}

/** Busca os alertas pelo verbo da API, enviando o filtro da URL. */
export async function fetchAlerts(minSeverity, fetcher = globalThis.fetch) {
  const response = await fetcher(ALERTS_PATH, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(minSeverity ? { sev: minSeverity } : {}),
  });
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (!response?.ok) {
    const detail = payload?.error ?? `HTTP ${response?.status ?? "?"}`;
    throw new Error(`alerts: ${detail}`);
  }
  return payload;
}

async function refreshAlerts(host, fetcher) {
  const search = typeof window !== "undefined" ? window.location.search : "";
  const minSeverity = minSeverityFromSearch(search);
  const payload = await fetchAlerts(minSeverity, fetcher);
  const items = Array.isArray(payload?.items) ? payload.items : [];
  mountAlerts(host, items, minSeverity);
  return items;
}

/** Inicializa o painel e relê os alertas a cada evento SSE. */
export async function initAlerts(
  host = typeof document !== "undefined" ? document.querySelector("[data-alerts]") : null,
  fetcher = globalThis.fetch,
) {
  if (!host) return null;
  try {
    await refreshAlerts(host, fetcher);
  } catch (error) {
    const search = typeof window !== "undefined" ? window.location.search : "";
    mountAlerts(host, [], minSeverityFromSearch(search));
    console.warn("alerts: falha ao carregar os alertas", error);
  }

  if (typeof window !== "undefined" && !boundHosts.has(host)) {
    boundHosts.add(host);
    window.addEventListener("ginga:event", () => {
      void refreshAlerts(host, fetcher).catch((error) => {
        console.warn("alerts: falha ao reatualizar os alertas", error);
      });
    });
  }
  return host;
}

if (typeof document !== "undefined") {
  const start = () => void initAlerts();
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
}
