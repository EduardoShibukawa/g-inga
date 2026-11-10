// "+ Intent" da Roda Web (T913). Este módulo só encaminha: o pedido cru vai
// para o verbo `intent new` (/v1/verbs/intent-new) e a triagem da trilha
// continua no ginga. Nenhuma regra vive aqui.

const INTENT_PATH = "/v1/verbs/intent-new";
const TRACK_LABEL = Object.freeze({ small: "pequena", feature: "feature" });

/** Corpo do verbo: texto aparado; trilha só quando o dono escolheu uma. */
export function intentRequest(text, track) {
  const clean = String(text ?? "").trim();
  if (!clean) throw new Error("Escreva o pedido antes de criar o INTENT.");
  const body = { text: clean };
  const chosen = String(track ?? "").trim().toLowerCase();
  if (chosen === "small" || chosen === "feature") body.track = chosen;
  return { path: INTENT_PATH, body };
}

/** Cria o INTENT e devolve a resposta do verbo (id, track, reasons). */
export async function submitIntent(text, track, fetcher = globalThis.fetch) {
  const request = intentRequest(text, track);
  const response = await fetcher(request.path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(request.body),
  });
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (!response?.ok) {
    throw new Error(payload && typeof payload.error === "string" ? payload.error : `HTTP ${response?.status ?? "?"}`);
  }
  return payload;
}

/** Uma linha para o dono: o que foi criado e o que a triagem decidiu. */
export function intentSummary(payload) {
  const track = TRACK_LABEL[payload?.track] ?? String(payload?.track ?? "");
  const reasons = Array.isArray(payload?.reasons) ? payload.reasons.filter(Boolean) : [];
  return `${payload?.id ?? "INTENT"} criado · trilha ${track}${reasons.length > 0 ? ` (${reasons.join("; ")})` : ""}`;
}

/** Liga o botão, o formulário e a linha de resultado. */
export function initIntent(root = typeof document !== "undefined" ? document : null) {
  const open = root?.querySelector?.("[data-intent-open]");
  const form = root?.querySelector?.("[data-intent-form]");
  if (!open || !form) return null;
  const text = form.querySelector("#intent-text");
  const track = form.querySelector("#intent-track");
  const result = form.querySelector("[data-intent-result]");
  const submit = form.querySelector('button[type="submit"]');

  const toggle = (show) => {
    form.hidden = !show;
    open.setAttribute("aria-expanded", String(show));
    if (show) text?.focus();
  };
  open.addEventListener("click", () => toggle(form.hidden));
  form.querySelector("[data-intent-cancel]")?.addEventListener("click", () => toggle(false));

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (submit) submit.disabled = true;
    try {
      const payload = await submitIntent(text?.value, track?.value);
      if (result) {
        result.textContent = intentSummary(payload);
        result.dataset.failed = "false";
      }
      if (text) text.value = "";
      window.dispatchEvent(new CustomEvent("ginga:intent-created", { detail: payload }));
    } catch (error) {
      if (result) {
        result.textContent = error instanceof Error ? error.message : String(error);
        result.dataset.failed = "true";
      }
    } finally {
      if (submit) submit.disabled = false;
    }
  });
  return form;
}

if (typeof document !== "undefined") {
  const start = () => void initIntent();
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
}
