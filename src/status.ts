import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Database } from "bun:sqlite";
import { listAlerts } from "./alerts";

export type Status = {
  schema_version: number;
  owner: Array<{ id: string; role?: string }>;
  plans: Array<{
    id: string;
    title?: string;
    status?: string;
    tasks: { total: number; pass: number; open: number; running?: number };
    attempts: number;
    cost_usd: number;
  }>;
  alerts: { critical: number; warn: number; info?: number };
  broken_sources: Array<{ source: string; reason: string }>;
};

function tableExists(db: Database, name: string): boolean {
  try {
    const row = db.query("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(name);
    return row !== null;
  } catch {
    return false;
  }
}

function getOwner(root: string): Array<{ id: string; role?: string }> {
  // Try to read from common locations
  const candidates = [
    join(root, ".ginga", "owner.json"),
    join(root, "owner.json"),
  ];
  for (const c of candidates) {
    if (existsSync(c)) {
      try {
        const raw = readFileSync(c, "utf8");
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
        if (parsed && Array.isArray((parsed as any).owner)) return (parsed as any).owner;
      } catch {}
    }
  }
  // Default owner if not found
  return [{ id: "owner", role: "owner" }];
}

function listPlans(root: string): Array<{ id: string; title?: string; status?: string }> {
  const plansDir = join(root, ".ginga", "plans");
  const out: Array<{ id: string; title?: string; status?: string }> = [];
  if (existsSync(plansDir)) {
    try {
      const { readdirSync } = require("node:fs");
      for (const entry of readdirSync(plansDir).sort()) {
        const m = /^(PLAN-\d{4}(?:-[^\s.]+)?)/.exec(entry);
        if (!m) continue;
        const file = join(plansDir, entry);
        if (!existsSync(file)) continue;
        const raw = readFileSync(file, "utf8");
        // simple frontmatter parse
        const titleMatch = raw.match(/^title:\s*(.+)$/m);
        const statusMatch = raw.match(/^status:\s*(.+)$/m);
        out.push({
          id: m[1],
          title: titleMatch ? titleMatch[1].trim() : entry,
          status: statusMatch ? statusMatch[1].trim() : undefined,
        });
      }
    } catch {}
  }
  return out;
}

export function buildStatus(root: string, dbPath: string, now: () => Date = () => new Date()): Status {
  const db = new Database(dbPath);
  try {
    const alerts = listAlerts(db, root);
    const owner = getOwner(root);
    const plans = listPlans(root);
    
    // Check broken sources - if GINGA_EVENTS points to non-existent file
    const broken_sources: Array<{ source: string; reason: string }> = [];
    const eventsPath = process.env.GINGA_EVENTS;
    if (eventsPath && !existsSync(eventsPath)) {
      broken_sources.push({ source: eventsPath, reason: "not_found" });
    }
    
    // Aggregate plan stats
    const resultPlans = plans.map((plan) => {
      let total = 0;
      let pass = 0;
      let open = 0;
      let attempts = 0;
      let cost_usd = 0;
      
      if (tableExists(db, "task_exec")) {
        try {
          // Try different schemas
          const hasPlanId = (() => {
            try {
              const info = db.query("PRAGMA table_info(task_exec)").all() as Array<any>;
              return info.some((col) => col.name === "plan_id");
            } catch {
              return false;
            }
          })();
          
          if (hasPlanId) {
            const rows = db.query("SELECT status, attempts, cost_usd FROM task_exec WHERE plan_id = ?").all(plan.id) as Array<any>;
            total = rows.length;
            for (const row of rows) {
              const status = String(row.status || "").toLowerCase();
              if (status === "pass") pass++;
              else open++;
              attempts += Number(row.attempts || 0);
              cost_usd += Number(row.cost_usd || 0);
            }
          } else {
            // Try composite key schema (plan, task)
            const rows = db.query("SELECT status, attempts FROM task_exec WHERE plan = ?").all(plan.id) as Array<any>;
            total = rows.length;
            for (const row of rows) {
              const status = String(row.status || "").toLowerCase();
              if (status === "pass") pass++;
              else open++;
              attempts += Number(row.attempts || 0);
            }
            // cost might be stored elsewhere, default to 0
            cost_usd = 0;
          }
        } catch (e) {
          // ignore
        }
      }
      
      return {
        id: plan.id,
        title: plan.title,
        status: plan.status,
        tasks: { total, pass, open },
        attempts,
        cost_usd,
      };
    });
    
    return {
      schema_version: 1,
      owner,
      plans: resultPlans,
      alerts: { critical: alerts.critical || 0, warn: alerts.warn || 0, info: alerts.info || 0 },
      broken_sources,
    };
  } finally {
    db.close();
  }
}
