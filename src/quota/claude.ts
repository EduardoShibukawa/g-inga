import { readFileSync } from "node:fs";
import type { Quota } from "./index.ts";

type ClaudeWindow = {
  used_percent: number | null;
  resets_at: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeResetsAt(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return new Date(value >= 1e12 ? value : value * 1000).toISOString();
}

function readWindow(value: unknown): ClaudeWindow | null {
  if (!isRecord(value)) return null;
  const used = value.used_percent;
  const resets = value.resets_at;
  return {
    used_percent: typeof used === "number" && Number.isFinite(used) ? used : null,
    resets_at: normalizeResetsAt(resets),
  };
}

/** Lê a janela de cinco horas gravada pela statusline do Claude. */
export function readClaudeQuota(path: string): Quota {
  const unavailable: Quota = {
    provider: "claude-pro",
    window: "5 hours",
    used_pct: null,
    resets_at: null,
    source: "unavailable",
  };

  let saved: unknown;
  try {
    saved = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return unavailable;
  }
  if (!isRecord(saved) || !isRecord(saved.rate_limits)) return unavailable;

  const fiveHour = readWindow(saved.rate_limits.five_hour);
  if (fiveHour === null) return { ...unavailable, source: "stale" };

  const complete = fiveHour.used_percent !== null && fiveHour.resets_at !== null;
  return {
    provider: "claude-pro",
    window: "5 hours",
    used_pct: fiveHour.used_percent,
    resets_at: fiveHour.resets_at,
    source: complete ? "claude-statusline" : "stale",
  };
}
