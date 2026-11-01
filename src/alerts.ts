import type { Database } from "bun:sqlite";

export type AlertSeverity = "info" | "warn" | "high" | "critical";

export type Alert = {
  id: string;
  ts: string;
  rule_id: string;
  severity: AlertSeverity;
  entity: string;
  summary: string;
  plan?: string;
  task?: string;
};

const RANK: Record<AlertSeverity, number> = { info: 1, warn: 2, high: 3, critical: 4 };

type EventRow = { id: string; ts: string | null; plan: string | null; task: string | null; json: string };

function record(value: unknown): Record<string, unknown> {
  if (typeof value === "string") {
    try { return record(JSON.parse(value)); } catch { return {}; }
  }
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function severity(value: unknown): AlertSeverity | null {
  const raw = String(value ?? "").toLowerCase();
  const normalized = raw === "warning" ? "warn" : raw;
  return normalized in RANK ? normalized as AlertSeverity : null;
}

/** Alertas do state.db, filtrados por severidade mínima e janela inicial. */
export function listAlerts(
  db: Database,
  o: { minSeverity?: AlertSeverity; since?: string } = {},
): Alert[] {
  let rows: EventRow[];
  try {
    rows = db.query("SELECT id, ts, plan, task, json FROM events WHERE kind = 'alert'").all() as EventRow[];
  } catch {
    return [];
  }

  const threshold = o.minSeverity ? RANK[o.minSeverity] : 0;
  const sinceMs = o.since ? Date.parse(o.since) : Number.NaN;
  const alerts: Alert[] = [];

  for (const row of rows) {
    const envelope = record(row.json);
    const data = record(envelope.data);
    const sev = severity(data.severity ?? envelope.severity);
    if (!sev || RANK[sev] < threshold) continue;

    const ts = String(row.ts ?? envelope.ts ?? "");
    if (Number.isFinite(sinceMs)) {
      const tsMs = Date.parse(ts);
      if (!Number.isFinite(tsMs) || tsMs < sinceMs) continue;
    }

    const plan = row.plan ?? (typeof data.plan === "string" ? data.plan : undefined);
    const task = row.task ?? (typeof data.task === "string" ? data.task : undefined);
    const entity = typeof data.entity === "string"
      ? data.entity
      : typeof envelope.entity === "string" ? envelope.entity : plan ?? task ?? row.id;
    const summary = typeof data.summary === "string"
      ? data.summary
      : typeof envelope.summary === "string" ? envelope.summary : "";
    const ruleId = typeof data.rule_id === "string"
      ? data.rule_id
      : typeof envelope.rule_id === "string" ? envelope.rule_id : "";

    alerts.push({
      id: row.id,
      ts,
      rule_id: ruleId,
      severity: sev,
      entity,
      summary,
      plan: plan ?? undefined,
      task: task ?? undefined,
    });
  }

  return alerts.sort((a, b) => {
    const at = Date.parse(a.ts);
    const bt = Date.parse(b.ts);
    if (Number.isFinite(at) && Number.isFinite(bt) && at !== bt) return bt - at;
    if (Number.isFinite(at) !== Number.isFinite(bt)) return Number.isFinite(at) ? -1 : 1;
    return b.id.localeCompare(a.id);
  });
}
