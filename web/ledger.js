// Tela "Ledger e Bench" da Roda Web (T914). Só mostra o que o verbo `ledger`
// devolve (/v1/verbs/ledger); a única escolha da tela é o filtro por status.

const LEDGER_PATH = "/v1/verbs/ledger";
const FILTERS = Object.freeze([
  ["todos", "Todos"],
  ["pass", "pass"],
  ["fail", "fail"],
  ["blocked", "blocked"],
]);
const FLOW_LABEL = Object.freeze({ prove_red: "prove-red", verify: "verify", judge: "judge" });

function escapeHtml(value) {
  const text = value === null || value === undefined ? "" : String(value);
  const entities = { "&": "&" + "amp;", "<": "&" + "lt;", ">": "&" + "gt;", '"': "&" + "quot;", "'": "&" + "#39;" };
  return text.replace(/[&<>"']/g, (char) => entities[char]);
}

function num(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function when(iso) {
  const text = String(iso ?? "");
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(text);
  return m ? `${m[3]}/${m[2]} ${m[4]}:${m[5]} UTC` : "—";
}

function kpi(name, label, value, note, tone = "") {
  return `<article class="metrics-kpi"${tone ? ` data-tone="${tone}"` : ""}>
    <span class="metrics-kpi-label">${escapeHtml(label)}</span>
    <strong class="metrics-kpi-value" data-kpi="${name}">${escapeHtml(value)}</strong>
    <span class="metrics-kpi-note">${escapeHtml(note)}</span>
  </article>`;
}

function chainKpi(chain) {
  if (!chain) return kpi("chain", "Cadeia", "—", "sem leitura do ledger");
  if (chain.ok) return kpi("chain", "Cadeia", "íntegra", `${num(chain.count)} blocos`, "ok");
  return kpi("chain", "Cadeia", "quebrada", `no bloco ${num(chain.broken_at)}`, "danger");
}

function tabs(tab) {
  return `<div class="ledger-tabs" role="tablist" aria-label="Ledger ou Bench">
    ${[["ledger", "Ledger"], ["bench", "Bench"]]
      .map(([id, label]) => `<button type="button" role="tab" class="ledger-tab" data-ledger-tab="${id}" aria-selected="${String(tab === id)}">${label}</button>`)
      .join("\n    ")}
  </div>`;
}

function table(rows) {
  const body = rows
    .map((r) => `<tr data-seq="${escapeHtml(r?.seq)}" data-status="${escapeHtml(r?.status)}">
      <td class="ledger-num">${escapeHtml(r?.seq)}</td>
      <td>${escapeHtml(when(r?.created_at))}</td>
      <td>${escapeHtml(r?.repo ?? "—")}</td>
      <th scope="row">${escapeHtml(r?.task)}</th>
      <td>${escapeHtml(FLOW_LABEL[r?.flow] ?? r?.flow ?? "—")}</td>
      <td><span class="ledger-status" data-status="${escapeHtml(r?.status)}">${escapeHtml(r?.status)}</span>${r?.reason_code ? ` <small>${escapeHtml(r.reason_code)}</small>` : ""}</td>
      <td>${escapeHtml(r?.model ?? "—")}</td>
      <td><code title="${escapeHtml(r?.summary ?? "")}">${escapeHtml(String(r?.hash ?? "").slice(0, 8))}</code></td>
    </tr>`)
    .join("\n");
  return `<div class="ledger-scroll"><table class="ledger-table">
    <thead><tr><th scope="col">#</th><th scope="col">Quando</th><th scope="col">Repo</th><th scope="col">TASK</th><th scope="col">Tipo</th><th scope="col">Status</th><th scope="col">Modelo</th><th scope="col">Hash</th></tr></thead>
    <tbody>${body}</tbody>
  </table></div>`;
}

/** HTML puro da tela. `view` = {tab: "ledger"|"bench", status: filtro}. */
export function renderLedgerHtml(payload, view = {}) {
  const data = payload ?? {};
  const tab = view.tab === "bench" ? "bench" : "ledger";
  const status = FILTERS.some(([id]) => id === view.status) ? view.status : "todos";
  if (tab === "bench") {
    return `<section class="roda-ledger" data-ledger-view="bench">
  ${tabs(tab)}
  <p class="ledger-note">SPECs com <code>bench:</code> no frontmatter rodam o bench no Verifier Judge. Uma regressão contra o baseline reprova o PLAN.</p>
  <p class="empty-state">Nenhuma SPEC com bench ainda.</p>
</section>`;
  }
  const all = Array.isArray(data.rows) ? data.rows : [];
  const rows = status === "todos" ? all : all.filter((r) => r?.status === status);
  const week = data.week ?? {};
  const kpis = [
    chainKpi(data.chain),
    kpi("week", "Receipts ok (7 dias)", `${num(week.pass)} / ${num(week.total)}`, "verify com pass"),
    kpi("total", "Receipts", String(num(data.total)), `${all.length} nesta lista`),
    kpi("red-failed", "Prove-red sem RED", String(num(data.red_failed)), "teste que já passava na base", num(data.red_failed) > 0 ? "danger" : ""),
  ].join("\n");
  const filters = FILTERS.map(
    ([id, label]) => `<button type="button" class="ledger-filter" data-ledger-filter="${id}" aria-pressed="${String(status === id)}">${label}</button>`,
  ).join("\n    ");
  const main = data.error
    ? `<p class="empty-state ledger-error" role="alert">Não deu para ler o ledger: ${escapeHtml(data.error)}</p>`
    : rows.length === 0
      ? `<p class="empty-state">Nenhum receipt${status === "todos" ? " no ledger" : ` com status ${escapeHtml(status)}`}.</p>`
      : table(rows);
  return `<section class="roda-ledger" data-ledger-view="ledger">
  ${tabs(tab)}
  <section class="metrics-kpis ledger-kpis" aria-label="Estado do ledger">${kpis}</section>
  <div class="ledger-filters" role="group" aria-label="Filtrar por status">
    ${filters}
  </div>
  ${main}
</section>`;
}

/** Busca o ledger e monta a tela; erro de API aparece no host. */
export async function loadLedger(host, fetcher = globalThis.fetch, view = {}) {
  if (!host) return null;
  let payload;
  try {
    const response = await fetcher(LEDGER_PATH, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    let body = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }
    if (!response?.ok) throw new Error(body && typeof body.error === "string" ? body.error : `HTTP ${response?.status ?? "?"}`);
    payload = body;
  } catch (error) {
    payload = { chain: null, total: 0, rows: [], week: { pass: 0, total: 0 }, red_failed: 0, error: error instanceof Error ? error.message : String(error) };
  }
  host.innerHTML = renderLedgerHtml(payload, view);
  return payload;
}

/** Liga abas, filtros e a recarga quando a view abre. */
export function initLedger(host = typeof document !== "undefined" ? document.querySelector("[data-ledger]") : null) {
  if (!host) return null;
  const view = { tab: "ledger", status: "todos" };
  let payload = null;
  const reload = async () => {
    payload = await loadLedger(host, globalThis.fetch, view);
  };
  host.addEventListener("click", (event) => {
    const tab = event.target?.closest?.("[data-ledger-tab]");
    const filter = event.target?.closest?.("[data-ledger-filter]");
    if (tab) view.tab = tab.getAttribute("data-ledger-tab");
    else if (filter) view.status = filter.getAttribute("data-ledger-filter");
    else return;
    host.innerHTML = renderLedgerHtml(payload, view);
  });
  window.addEventListener("ginga:viewchange", (event) => {
    if (event.detail?.view === "ledger") void reload();
  });
  if (window.location.hash === "#ledger") void reload();
  return host;
}

if (typeof document !== "undefined") {
  const start = () => void initLedger();
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
}
