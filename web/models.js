// Bloco "Modelos" da tela Modelos e quota (T916). Sem verbo novo: o gasto por
// modelo vem de `cost` e o FTPR por modelo de `metrics` (chaves `model:<nome>`).

const COST_PATH = "/v1/verbs/cost";
const METRICS_PATH = "/v1/verbs/metrics";

function escapeHtml(value) {
  const text = value === null || value === undefined ? "" : String(value);
  const entities = { "&": "&" + "amp;", "<": "&" + "lt;", ">": "&" + "gt;", '"': "&" + "quot;", "'": "&" + "#39;" };
  return text.replace(/[&<>"']/g, (char) => entities[char]);
}

function finite(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function usd(value) {
  return `US$ ${finite(value).toFixed(2)}`;
}

function costBlock(cost) {
  const entries = Object.entries(cost?.by_model ?? {}).sort(([, a], [, b]) => finite(b) - finite(a));
  if (entries.length === 0) return `<p class="empty-state">Nenhum custo medido ainda.</p>`;
  return `<table class="models-cost">
    <thead><tr><th scope="col">Modelo</th><th scope="col">Gasto</th></tr></thead>
    <tbody>${entries.map(([model, value]) => `<tr><th scope="row">${escapeHtml(model)}</th><td>${escapeHtml(usd(value))}</td></tr>`).join("")}</tbody>
    <tfoot><tr><th scope="row">Total</th><td>${escapeHtml(usd(cost?.total_usd))}</td></tr></tfoot>
  </table>`;
}

function ftprBlock(metrics) {
  const entries = Object.entries(metrics?.ftpr ?? {})
    .filter(([key]) => key.startsWith("model:"))
    .map(([key, value]) => [key.slice("model:".length), Math.round(Math.min(1, Math.max(0, finite(value))) * 100)])
    .sort(([, a], [, b]) => b - a);
  if (entries.length === 0) return `<p class="empty-state">Nenhuma execução medida ainda.</p>`;
  return `<ul class="ftpr-list">
    ${entries
      .map(([model, pct]) => `<li class="ftpr-row" data-ftpr-model="${escapeHtml(model)}">
      <span class="ftpr-model">${escapeHtml(model)}</span>
      <span class="ftpr-track" aria-hidden="true"><span class="ftpr-bar" style="width: ${pct}%"></span></span>
      <span class="ftpr-pct">${pct}%</span>
    </li>`)
      .join("\n    ")}
  </ul>`;
}

/** HTML puro do bloco. `data` = {cost, metrics} ou {error}. */
export function renderModelsHtml(data = {}) {
  if (data?.error) {
    return `<section class="roda-models"><p class="empty-state" role="alert">Não deu para ler os modelos: ${escapeHtml(data.error)}</p></section>`;
  }
  return `<section class="roda-models">
  <div class="models-block">
    <h2>Gasto por modelo</h2>
    ${costBlock(data?.cost)}
  </div>
  <div class="models-block">
    <h2>FTPR por modelo</h2>
    <p class="models-note">Quanto cada modelo acerta na primeira tentativa.</p>
    ${ftprBlock(data?.metrics)}
  </div>
</section>`;
}

async function post(path, fetcher) {
  const response = await fetcher(path, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (!response?.ok) throw new Error(payload && typeof payload.error === "string" ? payload.error : `HTTP ${response?.status ?? "?"}`);
  return payload;
}

/** Busca custo e métricas e monta o bloco. */
export async function loadModels(host, fetcher = globalThis.fetch) {
  if (!host) return null;
  let data;
  try {
    const [cost, metrics] = await Promise.all([post(COST_PATH, fetcher), post(METRICS_PATH, fetcher)]);
    data = { cost, metrics };
  } catch (error) {
    data = { error: error instanceof Error ? error.message : String(error) };
  }
  host.innerHTML = renderModelsHtml(data);
  return data;
}

if (typeof document !== "undefined") {
  const start = () => {
    const host = document.querySelector("[data-models]");
    if (!host) return;
    void loadModels(host);
    window.addEventListener("ginga:viewchange", (event) => {
      if (event.detail?.view === "quota") void loadModels(host);
    });
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
}
