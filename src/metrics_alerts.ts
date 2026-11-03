import type { Database } from "bun:sqlite";

export type RuleMetrics = {
  rule_id: string;
  count: number;
  open: number;
  mttr_min: number | null;
  cost_usd: number;
};

type EventRow = {
  id: string;
  ts: string | null;
  kind: string | null;
  plan: string | null;
  task: string | null;
  json: string;
};

type ParsedEvent = {
  id: string;
  kind: string;
  timestamp: string;
  time: number;
  identity: string | null;
  data: Record<string, unknown>;
};

type RuleAccumulator = {
  count: number;
  open: number;
  durations: number[];
  cost_usd: number;
};

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

function amount(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function parseEvent(row: EventRow): ParsedEvent {
  let envelope: Record<string, unknown> = {};
  try {
    envelope = record(JSON.parse(row.json));
  } catch {
    // Um evento corrompido não impede as demais métricas.
  }
  const data = record(envelope.data);
  const task = text(row.task) ?? text(envelope.task);
  const plan = text(row.plan) ?? text(envelope.plan);
  const fallback = text(data.entity);
  const identity = task !== undefined
    ? `task:${plan ?? ""}\u0000${task}`
    : plan !== undefined
      ? `plan:${plan}`
      : fallback !== undefined
        ? `entity:${fallback}`
        : null;
  const timestamp = text(row.ts) ?? text(envelope.ts) ?? text(data.ts) ?? "";
  return {
    id: row.id,
    kind: row.kind ?? "",
    timestamp,
    time: Date.parse(timestamp),
    identity,
    data: Object.keys(data).length > 0 ? data : envelope,
  };
}

function isResolution(event: ParsedEvent): boolean {
  return (event.kind === "receipt" && event.data.status === "pass")
    || (event.kind === "transition" && event.data.to === "done");
}

/** Calcula contagem, alertas abertos, MTTR e custo por regra do vigia. */
export function alertMetrics(
  db: Database,
  options: { since?: string } = {},
): RuleMetrics[] {
  let rows: EventRow[];
  try {
    rows = db
      .query(
        `SELECT id, ts, kind, plan, task, json FROM events
         WHERE kind IN ('alert', 'receipt', 'transition', 'cost')`,
      )
      .all() as EventRow[];
  } catch {
    return [];
  }

  const events = rows.map(parseEvent);
  const since = text(options.since);
  const sinceTime = since ? Date.parse(since) : Number.NaN;
  const rules = new Map<string, RuleAccumulator>();

  for (const alert of events) {
    if (alert.kind !== "alert" || !Number.isFinite(alert.time) || !alert.identity) continue;
    if (Number.isFinite(sinceTime) && alert.time < sinceTime) continue;
    const ruleId = text(alert.data.rule_id);
    if (!ruleId) continue;

    let resolvedAt: number | undefined;
    for (const event of events) {
      if (!event.identity || event.identity !== alert.identity || !isResolution(event)) continue;
      if (!Number.isFinite(event.time) || event.time <= alert.time) continue;
      if (resolvedAt === undefined || event.time < resolvedAt) resolvedAt = event.time;
    }

    let cost = 0;
    const costUntil = resolvedAt ?? Date.now();
    for (const event of events) {
      if (event.kind !== "cost" || event.identity !== alert.identity) continue;
      if (!Number.isFinite(event.time) || event.time < alert.time || event.time > costUntil) continue;
      cost += amount(event.data.amount_usd) ?? 0;
    }

    const rule = rules.get(ruleId) ?? { count: 0, open: 0, durations: [], cost_usd: 0 };
    rule.count += 1;
    rule.cost_usd += cost;
    if (resolvedAt === undefined) rule.open += 1;
    else rule.durations.push((resolvedAt - alert.time) / 60_000);
    rules.set(ruleId, rule);
  }

  return [...rules.entries()]
    .sort(([left], [right]) => (rules.get(right)!.count - rules.get(left)!.count) || left.localeCompare(right))
    .map(([rule_id, rule]) => ({
      rule_id,
      count: rule.count,
      open: rule.open,
      mttr_min: rule.durations.length === 0
        ? null
        : rule.durations.reduce((total, minutes) => total + minutes, 0) / rule.durations.length,
      cost_usd: rule.cost_usd,
    }));
}
