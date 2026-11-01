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
