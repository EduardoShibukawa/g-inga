import type { Database } from "bun:sqlite";

export type Metrics = {
  ftpr: Record<string, number>;
  cost_per_verified_task_usd: number;
  failures_by_reason: Record<string, number>;
  escalations: number;
  spent_usd: number;
};

type EventRow = {
  id: string;
  ts: string | null;
  kind: string | null;
  plan: string | null;
  task: string | null;
  json: string;
};

type Attempt = { data: Record<string, unknown> };
type TaskState = { attempts: Attempt[] };
type Ratio = { total: number; firstPasses: number };
type CostTotal = { present: boolean; amount: number };

const TIER_RANK: Record<string, number> = {
  free: 0,
  light: 1,
  medium: 2,
  strong: 3,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function taskKey(plan: string | null, task: string | null): string | null {
  if (!task) return null;
  return `${plan ?? ""}\u0000${task}`;
}

function parseEvent(row: EventRow): {
  data: Record<string, unknown>;
  plan: string | null;
  task: string | null;
} {
  let envelope: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(row.json);
    if (isRecord(parsed)) envelope = parsed;
  } catch {
    // Uma linha corrompida não impede as demais métricas.
  }
  const data = isRecord(envelope.data) ? envelope.data : envelope;
  return {
    data,
    plan: row.plan ?? nonEmptyString(envelope.plan) ?? null,
    task: row.task ?? nonEmptyString(envelope.task) ?? null,
  };
}

function addRatio(ratios: Map<string, Ratio>, key: string, firstPasses: boolean): void {
  const ratio = ratios.get(key) ?? { total: 0, firstPasses: 0 };
  ratio.total += 1;
  if (firstPasses) ratio.firstPasses += 1;
  ratios.set(key, ratio);
}

function ratioValue(ratio: Ratio | undefined): number {
  if (!ratio || ratio.total === 0) return 0;
  return ratio.firstPasses / ratio.total;
}

/** Calcula métricas de execução a partir dos eventos persistidos no state.db. */
export function computeMetrics(db: Database, options: { since?: string } = {}): Metrics {
  const hasEvents = db
    .query("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'events'")
    .get() !== null;
  if (!hasEvents) {
    return {
      ftpr: {},
      cost_per_verified_task_usd: 0,
      failures_by_reason: {},
      escalations: 0,
      spent_usd: 0,
    };
  }

  const since = options.since?.trim();
  const rows = (since
    ? db
        .query(
          `SELECT id, ts, kind, plan, task, json FROM events
           WHERE kind IN ('attempt', 'receipt', 'cost') AND ts >= ?
           ORDER BY ts ASC, id ASC`,
        )
        .all(since)
    : db
        .query(
          `SELECT id, ts, kind, plan, task, json FROM events
           WHERE kind IN ('attempt', 'receipt', 'cost')
           ORDER BY ts ASC, id ASC`,
        )
        .all()) as EventRow[];

  const tasks = new Map<string, TaskState>();
  const verified = new Set<string>();
  const failures = new Map<string, number>();
  const costs = new Map<string, CostTotal>();
  let spentUsd = 0;

  for (const row of rows) {
    const event = parseEvent(row);
    const key = taskKey(event.plan, event.task);

    if (row.kind === "attempt") {
      const failure = nonEmptyString(event.data.failure);
      if (failure) failures.set(failure, (failures.get(failure) ?? 0) + 1);
      if (!key) continue;
      const state = tasks.get(key) ?? { attempts: [] };
      state.attempts.push({ data: event.data });
      tasks.set(key, state);
      continue;
    }

    if (row.kind === "receipt") {
      const status = nonEmptyString(event.data.status);
      if (status === "pass" && key) verified.add(key);
      const reason = nonEmptyString(event.data.reason_code);
      if (status !== "pass" && reason) failures.set(reason, (failures.get(reason) ?? 0) + 1);
      continue;
    }

    if (row.kind === "cost") {
      const amount = finiteNumber(event.data.amount_usd);
      if (amount !== undefined) spentUsd += amount;
      if (!key) continue;
      const cost = costs.get(key) ?? { present: false, amount: 0 };
      cost.present = true;
      if (amount !== undefined) cost.amount += amount;
      costs.set(key, cost);
    }
  }

  const all: Ratio = { total: 0, firstPasses: 0 };
  const byModel = new Map<string, Ratio>();
  const byTier = new Map<string, Ratio>();
  let escalations = 0;

  for (const state of tasks.values()) {
    const counted = state.attempts.filter(({ data }) => {
      const failure = nonEmptyString(data.failure);
      return failure !== "quota_exhausted" && failure !== "infra";
    });
    if (counted.length === 0) continue;

    const firstPasses = counted.some(
      ({ data }) => data.attempt_n === 1 && data.passed === true,
    );
    all.total += 1;
    if (firstPasses) all.firstPasses += 1;

    const first = counted[0]!.data;
    const model = nonEmptyString(first.model);
    if (model) addRatio(byModel, `model:${model}`, firstPasses);
    const tier = nonEmptyString(first.tier);
    if (tier) addRatio(byTier, `tier:${tier}`, firstPasses);

    for (let index = 1; index < state.attempts.length; index += 1) {
      const previous = nonEmptyString(state.attempts[index - 1]!.data.tier);
      const current = nonEmptyString(state.attempts[index]!.data.tier);
      const previousRank = previous ? TIER_RANK[previous] : undefined;
      const currentRank = current ? TIER_RANK[current] : undefined;
      if (previousRank !== undefined && currentRank !== undefined && currentRank > previousRank) {
        escalations += 1;
      }
    }
  }

  const ftpr: Record<string, number> = {};
  if (all.total > 0) ftpr.all = ratioValue(all);
  for (const [key, ratio] of byModel) ftpr[key] = ratioValue(ratio);
  for (const [key, ratio] of byTier) ftpr[key] = ratioValue(ratio);

  let verifiedCost = 0;
  for (const key of verified) {
    const cost = costs.get(key);
    if (cost?.present) {
      verifiedCost += cost.amount;
      continue;
    }
    const attempts = tasks.get(key)?.attempts ?? [];
    for (const attempt of attempts) {
      const amount = finiteNumber(attempt.data.cost_usd);
      if (amount !== undefined) verifiedCost += amount;
    }
  }

  return {
    ftpr,
    cost_per_verified_task_usd: verified.size === 0 ? 0 : verifiedCost / verified.size,
    failures_by_reason: Object.fromEntries(failures),
    escalations,
    spent_usd: spentUsd,
  };
}
