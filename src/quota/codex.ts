import { readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { emitEvent } from "../events/emit.ts";

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

type PrimaryLimits = {
  used_percent: number | null;
  window_minutes: number | null;
  resets_at: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeResetsAt(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return new Date(value >= 1e12 ? value : value * 1000).toISOString();
}

/** Procura o rollout mais recente por mtime, sem seguir links de diretório. */
function latestRollout(sessions: string): string | null {
  let newest: { path: string; mtime: number } | null = null;
  const pending = [sessions];

  while (pending.length > 0) {
    const dir = pending.pop()!;
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        pending.push(path);
        continue;
      }
      if (!entry.isFile() || !/^rollout-.*\.jsonl$/.test(entry.name)) continue;

      try {
        const mtime = statSync(path).mtimeMs;
        if (newest === null || mtime > newest.mtime || (mtime === newest.mtime && path > newest.path)) {
          newest = { path, mtime };
        }
      } catch {
        // Um rollout removido durante a busca não impede os demais.
      }
    }
  }

  return newest?.path ?? null;
}

function primaryLimits(record: unknown): PrimaryLimits | null {
  if (!isRecord(record)) return null;
  const payload = isRecord(record.payload) ? record.payload : null;
  const limits = isRecord(record.rate_limits)
    ? record.rate_limits
    : payload && isRecord(payload.rate_limits)
      ? payload.rate_limits
      : null;
  if (!limits || !isRecord(limits.primary)) return null;

  const primary = limits.primary;
  return {
    used_percent: finiteNumber(primary.used_percent),
    window_minutes: finiteNumber(primary.window_minutes),
    resets_at: normalizeResetsAt(primary.resets_at),
  };
}

/** Usa a última ocorrência de rate_limits, tolerando linhas JSON inválidas. */
function lastRateLimits(path: string): PrimaryLimits | null {
  let latest: PrimaryLimits | null = null;
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return null;
  }

  for (const line of text.split("\n")) {
    if (line.trim() === "") continue;
    try {
      const limits = primaryLimits(JSON.parse(line));
      if (limits !== null) latest = limits;
    } catch {
      // Uma linha corrompida não invalida as rate_limits seguintes.
    }
  }
  return latest;
}

function unavailableQuota(): Quota {
  return {
    provider: "chatgpt-go",
    window: "unavailable",
    used_pct: null,
    resets_at: null,
    source: "unavailable",
  };
}

/** Lê a quota do Codex no rollout mais recente e emite o evento quota. */
export function readCodexQuota(
  codexHome: string = process.env.CODEX_HOME ?? join(homedir(), ".codex"),
): Quota {
  const rollout = latestRollout(join(codexHome, "sessions"));
  if (rollout === null) return unavailableQuota();

  const limits = lastRateLimits(rollout);
  if (limits === null) {
    return { ...unavailableQuota(), source: "stale" };
  }

  const complete = limits.used_percent !== null && limits.window_minutes !== null && limits.resets_at !== null;
  const quota: Quota = {
    provider: "chatgpt-go",
    window: limits.window_minutes === null ? "unknown" : `${limits.window_minutes} minutes`,
    used_pct: limits.used_percent,
    resets_at: limits.resets_at,
    source: complete ? "codex-rollout" : "stale",
  };

  if (complete) {
    emitEvent({
      source: "ginga",
      kind: "quota",
      data: {
        provider: quota.provider,
        source: quota.source,
        used_pct: quota.used_pct,
        window_minutes: limits.window_minutes,
        resets_at: quota.resets_at,
      },
    });
  }
  return quota;
}
