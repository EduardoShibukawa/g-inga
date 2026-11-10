// Inbox da Roda Web (PLAN-0012 TASK-13, follow-up do judge da TASK-03).
// Este módulo só encaminha: os botões chamam verbos do registro
// (/v1/verbs/<slug>) e o contador [data-count] é reatualizado pelo SSE de
// /v1/events. Nenhuma regra de escrita vive aqui — ela fica no registro.

const INBOX_PATH = "/v1/verbs/inbox";
const EVENTS_PATH = "/v1/events";

/** Verbos que a tela oferece (espelho de renderInbox, em src/web/render/inbox.ts). */
export const INBOX_VERBS = Object.freeze(["approve", "reject", "answer", "budget raise", "decide"]);

const VERB_LABEL = Object.freeze({
  approve: "Aprovar",
  reject: "Rejeitar…",
  answer: "Responder…",
  "budget raise": "Liberar orçamento…",
  decide: "Decidir…",
});

const TYPE_LABEL = Object.freeze({
  blocker: "BLOCKER",
  aprovar: "APROVAR",
  budget: "BUDGET",
  decidir: "DECIDIR",
  promover: "PROMOVER",
  "promover?": "PROMOVER?",
  alerta: "ALERTA",
});

const boundRoots = new WeakSet();

function attribute(element, name) {
  return element?.getAttribute?.(name)?.trim() ?? "";
}

function closest(element, selector) {
  return element?.closest?.(selector) ?? null;
}

/** Slug do verbo: "budget raise" → "budget-raise", a mesma regra da API. */
export function inboxVerbSlug(verb) {
  return String(verb ?? "").trim().replace(/\s+/g, "-");
}

/** Descreve a chamada de verbo correspondente a um botão do Inbox. */
export function inboxVerbRequest(button) {
  const verb = attribute(button, "data-verb");
  if (!INBOX_VERBS.includes(verb)) {
    throw new Error(`verbo do Inbox desconhecido: ${verb || "(vazio)"}`);
  }
  const id = attribute(button, "data-id");
  if (!id) throw new Error(`${verb}: item do Inbox ausente`);
  return { verb, path: `/v1/verbs/${inboxVerbSlug(verb)}`, body: { id } };
}

// `fetcher` é opcional: no navegador ninguém injeta, vale o fetch global (T911).
async function postJson(path, body, fetcher = globalThis.fetch) {
  const response = await fetcher(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (!response?.ok) {
    const detail = payload && typeof payload.error === "string" ? payload.error : `HTTP ${response?.status ?? "?"}`;
    throw new Error(`${path}: ${detail}`);
  }
  return payload;
}

/** Chama um verbo do Inbox e devolve o JSON da API. */
export async function invokeInboxVerb(button, fetcher = globalThis.fetch) {
  const request = inboxVerbRequest(button);
  return postJson(request.path, request.body, fetcher);
}

/** Itens do Inbox a partir da resposta do verbo. */
export function inboxItems(payload) {
  return Array.isArray(payload?.items) ? payload.items : [];
}

/** Quantas pendências o Inbox tem hoje. */
export function inboxCount(payload) {
  return inboxItems(payload).length;
}

function writeCount(counter, count) {
  if (!counter) return;
  counter.setAttribute("data-count", String(count));
  counter.textContent = String(count);
}

/** Relê o Inbox e grava a contagem no elemento [data-count]. */
export async function refreshInboxCount(counter, fetcher = globalThis.fetch) {
  const count = inboxCount(await postJson(INBOX_PATH, {}, fetcher));
  writeCount(counter, count);
  return count;
}

/** SSE: cada evento publicado em /v1/events reatualiza o contador. */
export function connectInboxSse(counter, source = new EventSource(EVENTS_PATH), fetcher = globalThis.fetch) {
  if (!source?.addEventListener) return null;
  source.addEventListener("message", () =>
    refreshInboxCount(counter, fetcher).catch((error) => {
      console.warn("inbox: falha ao reatualizar o contador", error);
    }),
  );
  return source;
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function actionsFor(item) {
  const declared = Array.isArray(item?.actions) ? item.actions : [];
  return [...new Set(declared.filter((verb) => INBOX_VERBS.includes(verb)))];
}

/** Um cartão do Inbox; os botões carregam data-verb e data-id. */
export function renderInboxItem(item) {
  const card = element("article", "inbox-card");
  card.dataset.type = String(item?.type ?? "");
  card.dataset.id = String(item?.id ?? "");
  if (item?.severity) card.dataset.severity = String(item.severity);

  const header = element("header", "inbox-card-header");
  header.append(element("span", "inbox-kind", TYPE_LABEL[item?.type] ?? String(item?.type ?? "").toUpperCase()));
  header.append(element("span", "inbox-entity", item?.entity ?? item?.id ?? ""));
  card.append(header, element("p", "inbox-title", item?.title ?? item?.entity ?? item?.id ?? ""));

  const actions = element("div", "inbox-actions");
  for (const [index, verb] of actionsFor(item).entries()) {
    const button = element("button", "inbox-action", VERB_LABEL[verb] ?? verb);
    button.type = "button";
    button.dataset.verb = verb;
    button.dataset.id = String(item?.id ?? "");
    if (index === 0) {
      button.classList.add("inbox-action-likely");
      button.dataset.likely = "true";
    }
    actions.append(button);
  }
  return card.append(actions), card;
}

/** Preenche o painel [data-inbox] com os cartões (ou com o estado vazio). */
export function mountInbox(host, items = []) {
  if (!host?.replaceChildren) return host;
  const list = Array.isArray(items) ? items : [];
  const plural = list.length === 1 ? "pendência" : "pendências";
  const count = element("span", "inbox-count", `${list.length} ${plural}`);
  count.dataset.inboxCount = String(list.length);

  const header = element("header", "inbox-header");
  header.append(element("h1", "", "Esperando você"), count);

  const wrap = element("div", "inbox-items");
  if (list.length === 0) {
    wrap.append(element("p", "empty-state", "Nada esperando você."));
  }
  for (const item of list) wrap.append(renderInboxItem(item));

  // linha de status: é onde o erro da API aparece (antes ele sumia)
  const status = element("p", "inbox-status");
  status.dataset.inboxStatus = "";
  status.setAttribute?.("data-inbox-status", "");
  status.setAttribute?.("role", "status");

  const root = element("section", "roda-inbox");
  root.append(header, wrap, status);
  host.replaceChildren(root);
  return root;
}

function announce(root, message, failed = false) {
  const output =
    root?.querySelector?.("[data-inbox-status]") ??
    (typeof document !== "undefined" ? document.querySelector("[data-inbox-status]") : null);
  if (!output) return;
  output.textContent = message;
  output.dataset.failed = String(failed);
}

/** A linha de status dentro do painel montado (DOM real ou nó de teste). */
function statusLine(root) {
  return (
    root?.children?.find?.((n) => n?.dataset && "inboxStatus" in n.dataset) ??
    root?.querySelector?.("[data-inbox-status]") ??
    null
  );
}

/**
 * Busca /v1/verbs/inbox e monta o painel (T912). Usado na abertura e depois de
 * cada verbo, para o cartão resolvido sair da tela. `note` fica na linha de status.
 */
export async function loadInbox(host, note = "", fetcher = globalThis.fetch) {
  const counter = typeof document !== "undefined" ? document.querySelector("[data-count]") : null;
  try {
    const items = inboxItems(await postJson(INBOX_PATH, {}, fetcher));
    const root = mountInbox(host, items);
    writeCount(counter, items.length);
    const line = statusLine(root);
    if (line && note) line.textContent = note;
  } catch (error) {
    const root = mountInbox(host, []);
    writeCount(counter, 0);
    const message = `Não consegui ler as pendências: ${error instanceof Error ? error.message : String(error)}`;
    const line = statusLine(root);
    if (line) {
      line.textContent = message;
      line.dataset.failed = "true";
    } else announce(host, message, true);
  }
  return host;
}

/** Liga os botões [data-verb] do Inbox ao registro de verbos. */
export function mountInboxActions(root = document) {
  if (!root?.addEventListener || boundRoots.has(root)) return root;
  boundRoots.add(root);

  root.addEventListener("click", async (event) => {
    const button = closest(event.target, "button[data-verb]");
    if (!button || !root.contains?.(button) || button.disabled) return;
    if (!INBOX_VERBS.includes(attribute(button, "data-verb"))) return;

    event.preventDefault();
    button.disabled = true;
    try {
      const verb = attribute(button, "data-verb");
      const result = await invokeInboxVerb(button);
      announce(root, `${verb}: ok`);
      if (typeof CustomEvent === "function") {
        button.dispatchEvent(new CustomEvent("ginga:inbox-action", { bubbles: true, detail: { verb, result } }));
      }
      // relê a lista: o item resolvido some e o resultado fica na linha de status
      if (root?.replaceChildren) await loadInbox(root, `${verb}: ok`);
    } catch (error) {
      announce(root, error instanceof Error ? error.message : String(error), true);
    } finally {
      button.disabled = false;
    }
  });
  return root;
}

/** Inicializa a tela quando o painel [data-inbox] está presente no documento. */
export async function initInbox(host = typeof document !== "undefined" ? document.querySelector("[data-inbox]") : null) {
  if (!host) return null;
  mountInboxActions(host);
  const counter = typeof document !== "undefined" ? document.querySelector("[data-count]") : null;
  if (counter && typeof EventSource !== "undefined") {
    connectInboxSse(counter, new EventSource(EVENTS_PATH));
  }

  await loadInbox(host);
  return host;
}

if (typeof document !== "undefined") {
  const start = () => void initInbox();
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
}
