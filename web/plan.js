// Detalhe do PLAN da Roda Web (PLAN-0012 TASK-05).
// Este módulo só encaminha as ações para os verbos da API; as regras de
// retry, escalada, pausa e cancelamento vivem no registro de verbos.

export const PLAN_VERBS = Object.freeze(["retry", "escalate", "pause", "cancel"]);

const TASK_VERBS = new Set(["retry", "escalate"]);
const boundRoots = new WeakSet();

function attribute(element, name) {
  return element?.getAttribute?.(name)?.trim() ?? "";
}

function closest(element, selector) {
  return element?.closest?.(selector) ?? null;
}

/** Descreve a chamada de verbo correspondente a um botão da tela. */
export function planVerbRequest(button) {
  const verb = attribute(button, "data-verb");
  if (!PLAN_VERBS.includes(verb)) throw new Error(`verbo de PLAN desconhecido: ${verb || "(vazio)"}`);

  const planScope = closest(button, "[data-plan]");
  const taskScope = closest(button, "[data-task-id]");
  const plan = attribute(button, "data-plan") || attribute(planScope, "data-plan");
  const task = attribute(button, "data-task") || attribute(taskScope, "data-task-id");

  if (!plan) throw new Error(`${verb}: PLAN ausente`);
  if (TASK_VERBS.has(verb) && !task) throw new Error(`${verb}: TASK ausente`);

  const body = { plan };
  if (TASK_VERBS.has(verb)) body.task = task;
  return { verb, path: `/v1/verbs/${verb}`, body };
}

/** Chama um verbo do PLAN e devolve o JSON da API. */
export async function invokePlanVerb(button, fetcher = globalThis.fetch) {
  const request = planVerbRequest(button);
  const response = await fetcher(request.path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(request.body),
  });

  let result = null;
  try {
    result = await response.json();
  } catch {
    result = null;
  }
  if (!response.ok) {
    const detail = result && typeof result.error === "string" ? result.error : `HTTP ${response.status}`;
    throw new Error(`plan ${request.verb}: ${detail}`);
  }
  return result;
}

function statusOutput(root) {
  return root?.querySelector?.("[data-plan-action-status]") ?? document.querySelector("[data-plan-action-status]");
}

function announce(root, message, failed = false) {
  const output = statusOutput(root);
  if (!output) return;
  output.textContent = message;
  output.dataset.failed = String(failed);
}

/** Liga os botões [data-verb] da tela ao registro de verbos. */
export function mountPlanActions(root = document) {
  if (!root || boundRoots.has(root)) return root;
  boundRoots.add(root);

  root.addEventListener("click", async (event) => {
    const target = event.target;
    const button = target?.closest?.("button[data-verb]");
    if (!button || !root.contains?.(button) || button.disabled) return;
    if (!PLAN_VERBS.includes(attribute(button, "data-verb"))) return;

    event.preventDefault();
    button.disabled = true;
    try {
      const result = await invokePlanVerb(button);
      announce(root, `${attribute(button, "data-verb")}: ok`);
      if (typeof CustomEvent === "function") {
        button.dispatchEvent(new CustomEvent("ginga:plan-action", {
          bubbles: true,
          detail: { verb: attribute(button, "data-verb"), result },
        }));
      }
    } catch (error) {
      announce(root, error instanceof Error ? error.message : String(error), true);
    } finally {
      button.disabled = false;
    }
  });
  return root;
}

/** Inicializa a tela do PLAN quando ela está presente no documento. */
export function initPlan(host) {
  const target = host ?? (typeof document !== "undefined" ? document.querySelector("[data-plan]") : null);
  if (!target) return null;
  return mountPlanActions(target);
}

if (typeof document !== "undefined") {
  const start = () => void initPlan();
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
}
