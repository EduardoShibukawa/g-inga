import type { Database } from "bun:sqlite";
import { join } from "node:path";
import { readClaudeQuota } from "./claude.ts";
import { readCodexQuota } from "./codex.ts";

export type QuotaSource =
  | "codex-rollout"
  | "claude-statusline"
  | "opencode-db"
  | "manual"
  | "unavailable"
  | "stale";

export type Quota = {
  provider: string;
  window: string;
  used_pct: number | null;
  resets_at: string | null;
  source: QuotaSource;
};

const ZEN_MONTHLY_BUDGET_USD = 10;

function manualQuota(provider: string): Quota {
  return {
    provider,
    window: "subscription",
    used_pct: null,
    resets_at: null,
    source: "manual",
  };
}

function monthStart(now = new Date()): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

function monthEnd(now = new Date()): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString();
}

/** Converte o gasto do mês do Zen no percentual do budget mensal do ROUTING. */
function zenQuota(db: Database, now = new Date()): Quota {
  const rows = db
    .query("SELECT ts, json FROM events WHERE kind = 'cost' AND ts >= ? AND ts < ? ORDER BY ts ASC, id ASC")
    .all(monthStart(now), monthEnd(now)) as Array<{ ts: string; json: string }>;
  let spent = 0;
  for (const row of rows) {
    try {
      const event = JSON.parse(row.json) as { data?: { amount_usd?: unknown; model?: unknown } };
      const amount = Number(event.data?.amount_usd ?? 0);
      const model = typeof event.data?.model === "string" ? event.data.model : "";
      if (Number.isFinite(amount) && amount > 0 && (model === "" || model.startsWith("opencode/"))) {
        spent += amount;
      }
    } catch {
      // Uma linha corrompida não impede o cálculo das demais.
    }
  }
  const usedPct = (spent / ZEN_MONTHLY_BUDGET_USD) * 100;
  return {
    provider: "zen",
    window: "month",
    used_pct: Number(usedPct.toFixed(4)),
    resets_at: monthEnd(now),
    source: "opencode-db",
  };
}

/** Junta as quotas automáticas, as manuais e o gasto mensal do Zen. */
export function readQuotas(o: { home: string; db: Database }): Quota[] {
  const claudePath = join(o.home, ".local", "state", "ginga", "claude-rate-limits.json");
  return [
    readClaudeQuota(claudePath),
    readCodexQuota(join(o.home, ".codex")),
    manualQuota("gemini-pro"),
    manualQuota("opencode-go"),
    zenQuota(o.db),
  ];
}
