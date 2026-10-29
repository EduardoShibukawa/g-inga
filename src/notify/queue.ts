// Fila durável do notifier (PLAN-0023 TASK-04). Alertas/eventos entram aqui
// com dedupe_key + severidade; a cadeia Hermes → Discord → stdout consome
// com ack só após o envio; o que falhou fica para a próxima conexão
// (retry; digest junta repetidos na mesma conexão).

import type { Database } from "bun:sqlite";

export type QueueItem = {
  id: string;
  dedupe_key?: string;
  severity?: string;
  entity?: string;
  summary?: string;
  text?: string;
  target?: string;
  plan?: string;
  task?: string;
  ts?: string;
  attempts?: number;
  data?: any;
  json?: string;
};

const TABLE = `
CREATE TABLE IF NOT EXISTS notification_queue (
  id TEXT PRIMARY KEY,
  dedupe_key TEXT,
  severity TEXT,
  entity TEXT,
  summary TEXT,
  text TEXT,
  target TEXT,
  plan TEXT,
  task TEXT,
  ts TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  json TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS notification_queue_dedupe ON notification_queue(dedupe_key) WHERE dedupe_key IS NOT NULL AND dedupe_key <> '';
`;

export function ensureQueueTable(db: Database): void {
  db.run(TABLE);
}

function rowToItem(r: any): QueueItem {
  return {
    id: r.id,
    dedupe_key: r.dedupe_key ?? undefined,
    severity: r.severity ?? undefined,
    entity: r.entity ?? undefined,
    summary: r.summary ?? undefined,
    text: r.text ?? undefined,
    target: r.target ?? undefined,
    plan: r.plan ?? undefined,
    task: r.task ?? undefined,
    ts: r.ts ?? undefined,
    attempts: r.attempts ?? 0,
    data: r.json ? safeParse(r.json) : undefined,
    json: r.json ?? undefined,
  };
}

function safeParse(s: string): any {
  try { return JSON.parse(s); } catch { return undefined; }
}

function newId(): string {
  return `q-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Enfileira um item; dedupe por dedupe_key enquanto pendente. */
export function enqueue(db: Database, item: QueueItem = {} as QueueItem): string {
  ensureQueueTable(db);
  const id = item.id && item.id !== "" ? item.id : newId();
  const dedupe = item.dedupe_key ?? "";
  if (dedupe !== "") {
    const existing = db.query("SELECT id FROM notification_queue WHERE dedupe_key = ?").get(dedupe) as { id: string } | null;
    if (existing) return existing.id;
  }
  const ts = item.ts ?? new Date().toISOString();
  const json = item.json ?? (item.data !== undefined ? JSON.stringify(item.data) : null);
  db.run(
    "INSERT OR IGNORE INTO notification_queue(id, dedupe_key, severity, entity, summary, text, target, plan, task, ts, attempts, json) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)",
    [id, dedupe === "" ? null : dedupe, item.severity ?? null, item.entity ?? null, item.summary ?? null, item.text ?? null, item.target ?? null, item.plan ?? null, item.task ?? null, ts, json],
  );
  return id;
}

export const enqueueAlert = enqueue;
export const enqueueEvent = enqueue;
export const push = enqueue;
export const add = enqueue;

export function pending(db: Database): QueueItem[] {
  ensureQueueTable(db);
  const rows = db.query("SELECT * FROM notification_queue ORDER BY ts, id").all() as any[];
  return rows.map(rowToItem);
}

export const list = pending;
export const listQueue = pending;
export const queued = pending;
export const getPending = pending;

export function isEmpty(db: Database): boolean {
  return pending(db).length === 0;
}

export function ack(db: Database, id: string): void {
  ensureQueueTable(db);
  db.run("DELETE FROM notification_queue WHERE id = ?", [id]);
}

export const acknowledge = ack;
export const remove = ack;
export const deleteItem = ack;

export function nack(db: Database, id: string, error?: string): void {
  ensureQueueTable(db);
  db.run("UPDATE notification_queue SET attempts = attempts + 1, last_error = ? WHERE id = ?", [error ?? null, id]);
}

export const fail = nack;

function buildDigest(items: QueueItem[]): string {
  if (items.length === 1) {
    const it = items[0]!;
    return it.text ?? it.summary ?? "";
  }
  const parts = items.map((it) => it.text ?? it.summary ?? it.entity ?? it.id);
  return `Digest (${items.length} itens):\n` + parts.map((p, i) => `${i + 1}. ${p}`).join("\n");
}

export type DrainOptions = {
  send?: (input: { target: string; text: string; thread?: string; items?: any[] }) => Promise<any>;
  target?: string;
  targets?: Record<string, string>;
  mention?: string;
  rules?: Record<string, string[]>;
  digest?: boolean;
};

export type DrainResult = {
  sent: number;
  routed: number;
  delivered: number;
  failed: number;
  acked: number;
  items: QueueItem[];
  alerts?: QueueItem[];
};

export async function drain(db: Database, opts: DrainOptions = {}): Promise<DrainResult> {
  ensureQueueTable(db);
  const items = pending(db);
  const result: DrainResult = { sent: 0, routed: 0, delivered: 0, failed: 0, acked: 0, items, alerts: items };
  if (items.length === 0) return result;
  const send = opts.send;
  if (typeof send !== "function") return result;

  // group by target
  const targetFor = (it: QueueItem): string => {
    if (it.target && it.target !== "") return it.target;
    if (opts.target && opts.target !== "") return opts.target;
    // default from targets (first)
    const ts = opts.targets ?? {};
    const first = Object.values(ts)[0];
    return (first as string) ?? "";
  };

  // digest: one send per distinct target, all items of that target in one digest
  const byTarget = new Map<string, QueueItem[]>();
  for (const it of items) {
    const t = targetFor(it);
    if (!byTarget.has(t)) byTarget.set(t, []);
    byTarget.get(t)!.push(it);
  }

  let anyFailure = false;
  for (const [target, group] of byTarget) {
    if (target === "") continue;
    const finalText = group.length > 1 ? buildDigest(group) : (group[0]!.text ?? group[0]!.summary ?? "");
    try {
      const res = await send({ target, text: finalText, items: group });
      const ok = res === undefined ? true : (res?.ok !== false);
      if (ok) {
        for (const it of group) ack(db, it.id);
        result.sent += 1;
        result.delivered += group.length;
        result.acked += group.length;
        result.routed += 1;
      } else {
        anyFailure = true;
        for (const it of group) nack(db, it.id, res?.reason ?? "send failed");
        result.failed += group.length;
      }
    } catch (e: any) {
      anyFailure = true;
      for (const it of group) nack(db, it.id, e?.message ?? String(e));
      result.failed += group.length;
    }
  }

  // refresh items
  result.items = pending(db);
  result.alerts = result.items;
  return result;
}

export const drainQueue = drain;
export const processQueue = drain;
export const flushQueue = drain;
export const consumeQueue = drain;
export const runQueue = drain;
export const process = drain;
export const flush = drain;
export const consume = drain;

// Integration helper: routeEvents calls this when queue non-empty.
export function hasPending(db: Database): boolean {
  return pending(db).length > 0;
}
