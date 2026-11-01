// Render puro da tela Inbox (PLAN-0012 TASK-03).
// A superfície decide a apresentação; as regras dos verbos ficam no registro.

import type { InboxItem } from "../../board";

export type InboxVerb = "approve" | "reject" | "answer" | "budget raise" | "decide";

const TYPE_LABEL: Record<InboxItem["type"], string> = {
  blocker: "BLOCKER",
  aprovar: "APROVAR",
  budget: "BUDGET",
  decidir: "DECIDIR",
  promover: "PROMOVER",
  "promover?": "PROMOVER?",
  alerta: "ALERTA",
};

const DEFAULT_ACTIONS: Partial<Record<InboxItem["type"], InboxVerb[]>> = {
  blocker: ["answer"],
  aprovar: ["approve", "reject"],
  budget: ["budget raise"],
  decidir: ["decide"],
};

const ACTION_LABEL: Record<InboxVerb, string> = {
  approve: "Aprovar",
  reject: "Rejeitar…",
  answer: "Responder…",
  "budget raise": "Liberar orçamento…",
  decide: "Decidir…",
};

const VERBS = new Set<string>(Object.keys(ACTION_LABEL));

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

function actionsFor(item: InboxItem): InboxVerb[] {
  const declared = item.actions ?? DEFAULT_ACTIONS[item.type] ?? [];
  return [...new Set(declared.filter((verb): verb is InboxVerb => VERBS.has(verb)))];
}

function renderActions(item: InboxItem): string {
  return actionsFor(item)
    .map((verb, index) => {
      const likely = index === 0 ? ' data-likely="true"' : "";
      return `<button type="button" class="inbox-action${index === 0 ? " inbox-action-likely" : ""}" data-verb="${verb}" data-id="${escapeHtml(item.id)}"${likely}>${ACTION_LABEL[verb]}</button>`;
    })
    .join("");
}

/** HTML da Inbox. Não consulta estado nem executa verbos. */
export function renderInbox(items: InboxItem[]): string {
  const count = items.length;
  const plural = count === 1 ? "pendência" : "pendências";
  const cards = items
    .map((item) => {
      const entity = item.entity ?? item.id;
      const title = item.title ?? entity;
      const severity = item.severity ? ` data-severity="${escapeHtml(item.severity)}"` : "";
      return `<article class="inbox-card" data-type="${escapeHtml(item.type)}" data-id="${escapeHtml(item.id)}"${severity}>
  <header class="inbox-card-header"><span class="inbox-kind">${TYPE_LABEL[item.type]}</span><span class="inbox-entity">${escapeHtml(entity)}</span></header>
  <p class="inbox-title">${escapeHtml(title)}</p>
  <div class="inbox-actions">${renderActions(item)}</div>
</article>`;
    })
    .join("\n");

  return `<section class="roda-inbox" data-inbox aria-labelledby="inbox-title">
  <header class="inbox-header"><h1 id="inbox-title">Esperando você</h1><span class="inbox-count" data-count="${count}" aria-live="polite">${count} ${plural}</span></header>
  <div class="inbox-items" data-inbox-items>${cards}</div>
</section>`;
}
