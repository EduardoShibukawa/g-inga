// Tela "SPEC aberta" da Roda Web (T915). Mostra o que o verbo `spec` devolve
// e encaminha as decisões para os verbos que já existem: `approve`, `reject`
// (pedir mudança, com motivo) e `answer` (responder um blocker).

const SPEC_PATH = "/v1/verbs/spec";
const STATUS_PATH = "/v1/verbs/status";
const OPEN_STATUSES = new Set(["draft", "blocked"]);

function escapeHtml(value) {
  const text = value === null || value === undefined ? "" : String(value);
  const entities = { "&": "&" + "amp;", "<": "&" + "lt;", ">": "&" + "gt;", '"': "&" + "quot;", "'": "&" + "#39;" };
  return text.replace(/[&<>"']/g, (char) => entities[char]);
}

function day(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso ?? ""));
  return m ? `${m[3]}/${m[2]}` : "";
}

/** Verbo e corpo de cada decisão da tela. */
export function specAction(kind, input = {}) {
  if (kind === "approve") return { path: "/v1/verbs/approve", body: { id: input.id } };
  if (kind === "reject") {
    const reason = String(input.reason ?? "").trim();
    if (!reason) throw new Error("Diga o que precisa mudar antes de devolver a SPEC.");
    return { path: "/v1/verbs/reject", body: { id: input.id, reason } };
  }
  if (kind === "answer") {
    const text = String(input.text ?? "").trim();
    if (!text) throw new Error("Escreva a resposta antes de enviar.");
    return { path: "/v1/verbs/answer", body: { blocker_id: input.blocker_id, text } };
  }
  throw new Error(`ação desconhecida: ${kind}`);
}

function list(specs) {
  const items = Array.isArray(specs) ? specs : [];
  if (items.length === 0) return `<p class="empty-state">Nenhuma SPEC neste workspace. Um pedido na trilha feature vira SPEC.</p>`;
  return `<ul class="spec-list">
    ${items
      .map((s) => `<li><button type="button" class="spec-open" data-spec-open="${escapeHtml(s?.id)}">
        <span class="spec-id">${escapeHtml(s?.id)}</span>
        <span class="spec-open-title">${escapeHtml(s?.title)}</span>
        <span class="spec-status" data-status="${escapeHtml(s?.status)}">${escapeHtml(s?.status)}</span>
      </button></li>`)
      .join("\n    ")}
  </ul>`;
}

function blockerCard(blocker) {
  const options = Array.isArray(blocker?.options) ? blocker.options : [];
  const id = escapeHtml(blocker?.id);
  return `<article class="spec-blocker" data-blocker="${id}">
    <h3>${escapeHtml(blocker?.question)}</h3>
    ${blocker?.raised_by ? `<p class="spec-meta">Levantado por ${escapeHtml(blocker.raised_by)}.</p>` : ""}
    ${options.length > 0
      ? `<div class="spec-options" role="group" aria-label="Opções">${options
          .map((o) => `<button type="button" class="spec-action" data-spec-option="${escapeHtml(o)}" data-blocker-id="${id}">${escapeHtml(o)}</button>`)
          .join("")}</div>`
      : ""}
    <form class="spec-answer" data-spec-answer="${id}">
      <label for="spec-answer-${id}">Sua resposta</label>
      <textarea id="spec-answer-${id}" name="text" rows="2" required></textarea>
      <button type="submit" class="spec-action spec-action-primary">Responder</button>
    </form>
  </article>`;
}

/** HTML puro da tela. Sem SPEC aberta, mostra a lista para escolher. */
export function renderSpecHtml(spec, specs = [], note = "") {
  if (!spec) {
    return `<section class="roda-spec" data-spec-view="list">
  ${note ? `<p class="spec-note" role="alert">${escapeHtml(note)}</p>` : ""}
  ${list(specs)}
</section>`;
  }
  const blockers = Array.isArray(spec.blockers) ? spec.blockers : [];
  const answers = Array.isArray(spec.answers) ? spec.answers : [];
  const acs = Array.isArray(spec.acs) ? spec.acs : [];
  const extra = Array.isArray(spec.sections) ? spec.sections : [];
  const open = OPEN_STATUSES.has(String(spec.status));
  const meta = [spec.id, spec.intent, spec.bench ? `bench: ${spec.bench}` : null, spec.file].filter(Boolean).map(escapeHtml).join(" · ");

  const decide = !open
    ? `<p class="spec-meta">Esta SPEC está <strong>${escapeHtml(spec.status)}</strong>; não há decisão pendente.</p>`
    : blockers.length > 0
      ? `<p class="spec-meta">Responda ${blockers.length === 1 ? "o blocker" : `os ${blockers.length} blockers`} para liberar a aprovação.</p>
    <form class="spec-reject" data-spec-reject="${escapeHtml(spec.id)}">${rejectFields()}</form>`
      : `<button type="button" class="spec-action spec-action-primary" data-spec-approve="${escapeHtml(spec.id)}">Aprovar SPEC</button>
    <form class="spec-reject" data-spec-reject="${escapeHtml(spec.id)}">${rejectFields()}</form>
    <p class="spec-meta">Depois de aprovar, o Planner escreve os PLANs. Cada PLAN passa pelo linter e aparece no Inbox.</p>`;

  return `<section class="roda-spec" data-spec-view="detail" data-spec-id="${escapeHtml(spec.id)}">
  <button type="button" class="spec-back" data-spec-back>← Todas as SPECs</button>
  ${note ? `<p class="spec-note" role="status">${escapeHtml(note)}</p>` : ""}
  <header class="spec-header">
    <p class="spec-meta">${meta}</p>
    <h2>${escapeHtml(spec.title)} <span class="spec-status" data-status="${escapeHtml(spec.status)}">${escapeHtml(spec.status)}</span></h2>
  </header>
  <div class="spec-columns">
    <div class="spec-main">
      <section><h3>Objetivo</h3><p class="spec-text">${escapeHtml(spec.objective) || "—"}</p></section>
      <section><h3>Critérios de aceite</h3>
        ${acs.length === 0
          ? `<p class="spec-meta">A SPEC ainda não lista critérios de aceite.</p>`
          : `<ol class="spec-acs">${acs.map((ac) => `<li data-ac="${escapeHtml(ac?.id)}"><span class="spec-id">${escapeHtml(ac?.id)}</span> <span>${escapeHtml(ac?.text)}</span></li>`).join("")}</ol>`}
      </section>
      ${extra.map((s) => `<section><h3>${escapeHtml(s?.title)}</h3><p class="spec-text">${escapeHtml(s?.body)}</p></section>`).join("\n      ")}
    </div>
    <aside class="spec-side">
      <section><h3>Blockers</h3>
        ${blockers.length === 0 ? `<p class="spec-meta">Nenhum blocker aberto.</p>` : blockers.map(blockerCard).join("\n")}
      </section>
      <section><h3>Respostas</h3>
        ${answers.length === 0
          ? `<p class="spec-meta">Nenhuma ainda.</p>`
          : `<ul class="spec-answers">${answers.map((a) => `<li><span class="spec-meta">${escapeHtml([day(a?.ts), a?.by, a?.via ? `via ${a.via}` : ""].filter(Boolean).join(" · "))}</span><br>${escapeHtml(a?.question)}: <strong>${escapeHtml(a?.answer)}</strong></li>`).join("")}</ul>`}
      </section>
      <section class="spec-decide"><h3>Decidir</h3>
        ${decide}
      </section>
    </aside>
  </div>
</section>`;
}

function rejectFields() {
  return `<label for="spec-reject-reason">Pedir mudança</label>
      <textarea id="spec-reject-reason" name="reason" rows="2" required placeholder="O que precisa mudar"></textarea>
      <button type="submit" class="spec-action">Devolver com o pedido</button>`;
}

async function post(path, body, fetcher) {
  const response = await fetcher(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (!response?.ok) throw new Error(payload && typeof payload.error === "string" ? payload.error : `HTTP ${response?.status ?? "?"}`);
  return payload;
}

/** Busca uma SPEC e monta a tela; erro de API aparece no host. */
export async function loadSpec(host, id, fetcher = globalThis.fetch, note = "") {
  if (!host) return null;
  try {
    const spec = await post(SPEC_PATH, { id }, fetcher);
    host.innerHTML = renderSpecHtml(spec, [], note);
    return spec;
  } catch (error) {
    host.innerHTML = renderSpecHtml(null, [], error instanceof Error ? error.message : String(error));
    return null;
  }
}

/** Lista as SPECs do workspace (do verbo `status`). */
export async function loadSpecList(host, fetcher = globalThis.fetch, note = "") {
  if (!host) return [];
  try {
    const status = await post(STATUS_PATH, {}, fetcher);
    const specs = Array.isArray(status?.specs) ? status.specs : [];
    host.innerHTML = renderSpecHtml(null, specs, note);
    return specs;
  } catch (error) {
    host.innerHTML = renderSpecHtml(null, [], error instanceof Error ? error.message : String(error));
    return [];
  }
}

/** Liga a lista, o detalhe e as decisões. */
export function initSpec(host = typeof document !== "undefined" ? document.querySelector("[data-spec]") : null) {
  if (!host) return null;
  let current = new URLSearchParams(window.location.search).get("spec");
  const show = (note = "") => (current ? loadSpec(host, current, globalThis.fetch, note) : loadSpecList(host, globalThis.fetch, note));
  const act = async (kind, input, done) => {
    try {
      const request = specAction(kind, input);
      await post(request.path, request.body, globalThis.fetch);
      await show(done);
    } catch (error) {
      await show(error instanceof Error ? error.message : String(error));
    }
  };

  host.addEventListener("click", (event) => {
    const target = event.target;
    const open = target?.closest?.("[data-spec-open]");
    const option = target?.closest?.("[data-spec-option]");
    const approve = target?.closest?.("[data-spec-approve]");
    if (open) {
      current = open.getAttribute("data-spec-open");
      void show();
    } else if (target?.closest?.("[data-spec-back]")) {
      current = null;
      void show();
    } else if (option) {
      void act("answer", { blocker_id: option.getAttribute("data-blocker-id"), text: option.getAttribute("data-spec-option") }, "Resposta gravada.");
    } else if (approve) {
      void act("approve", { id: approve.getAttribute("data-spec-approve") }, "SPEC aprovada.");
    }
  });
  host.addEventListener("submit", (event) => {
    const form = event.target;
    const answer = form?.getAttribute?.("data-spec-answer");
    const reject = form?.getAttribute?.("data-spec-reject");
    if (!answer && !reject) return;
    event.preventDefault();
    const value = form.querySelector("textarea")?.value;
    if (answer) void act("answer", { blocker_id: answer, text: value }, "Resposta gravada.");
    else void act("reject", { id: reject, reason: value }, "SPEC devolvida com o pedido de mudança.");
  });
  window.addEventListener("ginga:viewchange", (event) => {
    if (event.detail?.view === "spec") void show();
  });
  if (window.location.hash === "#spec") void show();
  return host;
}

if (typeof document !== "undefined") {
  const start = () => void initSpec();
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
}
