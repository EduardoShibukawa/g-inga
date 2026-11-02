import { join } from "node:path";
import type { VerbArgs, VerbCtx } from "./registry";
import { readOpencodeSessions, syncCost } from "../cost/opencode_db.ts";

function defaultOpencodeDb(): string {
  return join(process.env.HOME ?? "", ".local", "share", "opencode", "opencode.db");
}

export function costSync(ctx: VerbCtx, args: VerbArgs): unknown {
  const dbPath = args.db && args.db.trim() !== "" ? args.db : defaultOpencodeDb();
  const sessions = readOpencodeSessions(dbPath, { since: args.since });
  return syncCost(ctx.db, sessions);
}

export function costSummary(ctx: VerbCtx): unknown {
  const rows = ctx.db
    .query("SELECT ts, json FROM events WHERE kind = 'cost' ORDER BY ts ASC, id ASC")
    .all() as Array<{ ts: string; json: string }>;
  const byDay: Record<string, number> = {};
  const byModel: Record<string, number> = {};
  let total = 0;
  for (const row of rows) {
    try {
      const event = JSON.parse(row.json) as { data?: { amount_usd?: unknown; model?: unknown } };
      const amount = Number(event.data?.amount_usd ?? 0);
      const model = typeof event.data?.model === "string" ? event.data.model : "unknown";
      const day = row.ts.slice(0, 10);
      total += amount;
      byDay[day] = (byDay[day] ?? 0) + amount;
      byModel[model] = (byModel[model] ?? 0) + amount;
    } catch {
      // Ignora somente a linha corrompida; as demais continuam mensuráveis.
    }
  }
  return { total_usd: total, by_day: byDay, by_model: byModel };
}
