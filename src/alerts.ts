import { Database } from "bun:sqlite";

export type AlertsSummary = {
  critical: number;
  warn: number;
  info?: number;
};

function tableExists(db: Database, name: string): boolean {
  try {
    const row = db.query("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(name);
    return row !== null;
  } catch {
    return false;
  }
}

function parsePayload(payload: string): Record<string, any> {
  try {
    const parsed = JSON.parse(payload);
    if (parsed && typeof parsed === "object") return parsed as Record<string, any>;
  } catch {}
  return {};
}

export function listAlerts(db: Database, root?: string): AlertsSummary {
  const summary: AlertsSummary = { critical: 0, warn: 0, info: 0 };
  
  if (tableExists(db, "events")) {
    try {
      const rows = db.query("SELECT kind, payload_json FROM events WHERE kind = 'alert'").all() as Array<any>;
      for (const row of rows) {
        const payload = parsePayload(row.payload_json || "{}");
        const severity = String(payload.severity || "").toLowerCase();
        if (severity === "critical") summary.critical++;
        else if (severity === "warn" || severity === "warning") summary.warn++;
        else if (severity === "info") summary.info = (summary.info || 0) + 1;
      }
    } catch (e) {
      // ignore
    }
  }
  
  return summary;
}
