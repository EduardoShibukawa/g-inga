// Render puro do painel de alertas (PLAN-0012 TASK-09).
// Sem estado e sem verbos: só apresentação a partir de Alert[] (src/alerts.ts).

import type { Alert, AlertSeverity } from "../../alerts";

const SEVERITY_RANK: Record<AlertSeverity, number> = {
  info: 0,
  warn: 1,
  high: 2,
  critical: 3,
};

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

/**
 * HTML do painel de alertas. `minSeverity` mostra a severidade escolhida e as
 * acima (info < warn < high < critical); sem filtro, mostra todas.
 */
export function renderAlerts(alerts: Alert[], minSeverity?: AlertSeverity): string {
  const floor = minSeverity ? SEVERITY_RANK[minSeverity] : -1;
  const visible = alerts.filter((a) => SEVERITY_RANK[a.severity] >= floor);
  const rows = visible
    .map((a) => {
      const plan = a.plan ? ` data-plan="${escapeHtml(a.plan)}"` : "";
      return `<li class="alert-row" data-severity="${escapeHtml(a.severity)}" data-id="${escapeHtml(a.id)}"${plan}>
  <span class="alert-sev">${escapeHtml(a.severity.toUpperCase())}</span>
  <span class="alert-rule">${escapeHtml(a.rule_id)}</span>
  <span class="alert-entity">${escapeHtml(a.entity)}</span>
  <span class="alert-summary">${escapeHtml(a.summary)}</span>
  <time class="alert-ts">${escapeHtml(a.ts)}</time>
</li>`;
    })
    .join("\n");

  return `<section class="roda-alerts" data-alerts aria-labelledby="alerts-title">
  <header class="alerts-header"><h1 id="alerts-title">Alertas</h1><span class="alerts-count" data-count="${visible.length}">${visible.length}</span></header>
  <ul class="alerts-list" data-alerts-list>${rows}</ul>
</section>`;
}
