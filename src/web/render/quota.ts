import type { Quota } from "../../quota";

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

function usage(quota: Quota): string {
  if (quota.used_pct === null) return quota.source === "manual" ? "manual" : "—";
  return `${quota.used_pct}%`;
}

/** HTML puro da tela de quota. Não consulta estado nem executa verbos. */
export function renderQuota(quotas: Quota[]): string {
  const body = (quotas ?? []).length === 0
    ? `<tr><td>—</td><td>—</td><td>—</td><td>—</td><td>—</td></tr>`
    : quotas.map((quota) => `<tr data-provider="${escapeHtml(quota.provider)}">
      <th scope="row">${escapeHtml(quota.provider)}</th>
      <td>${escapeHtml(quota.window)}</td>
      <td>${escapeHtml(usage(quota))}</td>
      <td>${escapeHtml(quota.resets_at ?? "—")}</td>
      <td>${escapeHtml(quota.source)}</td>
    </tr>`).join("\n");

  return `<section class="roda-quota" data-quota aria-labelledby="quota-title">
  <header class="quota-header"><h1 id="quota-title">Quota</h1></header>
  <table>
    <thead><tr><th scope="col">Provider</th><th scope="col">Janela</th><th scope="col">Uso</th><th scope="col">Reseta</th><th scope="col">Fonte</th></tr></thead>
    <tbody>${body}</tbody>
  </table>
</section>`;
}
