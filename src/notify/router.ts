// Event router (PLAN-0010 TASK-05): transforma eventos ingeridos (tabela
// `events` do state.db, TASK-01) em notificações, pelas regras de 05 §6.
// Cada evento é notificado no máximo uma vez: processados ficam marcados na
// tabela `notification_log` deste mesmo db. Quando o envio de um canal devolve
// `thread_id`, o router grava em `plan_thread(plan, target, thread_id)` e passa
// `thread` nos envios seguintes do mesmo PLAN pelo mesmo target — uma thread do
// Discord por PLAN (doc 05 §4). O router só envia: eventos são fatos, ele não
// chama verbos (doc 07, "Regras").

import type { Database } from "bun:sqlite";
import { dirname } from "node:path";
import { classify, DEFAULT_RULES } from "./rules.ts";
import { drain as drainQueue, hasPending as queueHasPending, enqueue as enqueueQueue } from "./queue.ts";
import { appendPlanLog } from "../plan_log.ts";

export type RouteSendInput = { target: string; text: string; thread?: string };
export type RouteSendResult = { ok: boolean; thread_id?: string };
export type RouteSend = (input: RouteSendInput) => Promise<RouteSendResult>;

export type RouteOptions = {
  send: RouteSend;
  /** closed canal → target da porta de notificação (ex.: { discord: "discord:123" }). */
  targets: Record<string, string>;
  /** Menção (ex. "<@42>") incluída só nas mensagens de discord. */
  mention?: string;
  /** Sobrescrita por chave de `[notify.rules]` do project.toml. */
  rules?: Record<string, string[]>;
  /** Raiz do bundle (`.ginga/`) para o log.md automático; ausente → derivada do state.db. */
  planLogRoot?: string;
};

/** Raiz do bundle a partir do arquivo do state.db (`<bundle>/state/state.db`); null sem caminho. */
function bundleRootFromDb(db: Database): string | null {
  try {
    const row = db.query("PRAGMA database_list").get() as { file?: string } | null;
    const file = row?.file ?? "";
    if (file === "") return null;
    return dirname(dirname(file));
  } catch {
    return null;
  }
}

/** Marcador de "já notificado" (permanece no state.db entre rodadas). */
const MARKED_TABLE = `
CREATE TABLE IF NOT EXISTS notification_log (
  id TEXT PRIMARY KEY,
  ts TEXT
);
`;

/** Lê os eventos ainda não notificados, envia por canal da regra e marca. */
export async function routeEvents(
  db: Database,
  o: RouteOptions,
): Promise<{ routed: number }> {
  db.run(MARKED_TABLE);
  const rules = { ...DEFAULT_RULES, ...(o.rules ?? {}) };
  let routed = 0;
  if (queueHasPending(db)) {
    try {
      const drained = await drainQueue(db, {
        send: async (m: any) => {
          const items = Array.isArray(m?.items) ? m.items : [];
          const plans = [...new Set(items.map((it: any) => it?.plan).filter((pl: any) => typeof pl === "string" && pl !== ""))];
          const inputThread = plans.length > 0 ? threadIfSaved(db, m.target, plans[0]) : undefined;
          const r = await o.send({ target: m.target, text: m.text, ...(inputThread ? { thread: inputThread } : {}) });
          if (r?.thread_id) {
            for (const pl of plans) saveThread(db, pl, m.target, r.thread_id);
          }
          return r;
        },
        targets: o.targets, mention: o.mention, rules: o.rules,
      });
      routed += drained.routed ?? drained.sent ?? 0;
    } catch {}
  }
  const rows = db
    .query("SELECT id, json FROM events WHERE id NOT IN (SELECT id FROM notification_log)")
    .all() as { id: string; json: string }[];

  for (const row of rows) {
    let ev: Record<string, any>;
    try {
      ev = JSON.parse(row.json);
    } catch {
      markNotified(db, row.id, null);
      continue;
    }
    // log.md automático (PLAN-0013 TASK-01): todo evento do PLAN vira linha,
    // mesmo os que não têm canal — idempotente por ev.id, só append.
    try {
      const bundleRoot = o.planLogRoot ?? bundleRootFromDb(db);
      if (bundleRoot !== null) appendPlanLog(bundleRoot, ev);
    } catch {}
    const key = classify(ev);
    const channels = key ? (rules[key] ?? []) : [];
    if (channels.length === 0) {
      markNotified(db, row.id);
      continue;
    }
    let sent = false;
    for (const channel of channels) {
      const target = o.targets[channel];
      if (!target || target === "") continue;
      const isDiscord = channel.startsWith("discord");
      const thread = threadIfSaved(db, target, ev.plan);
      const text = composeText(ev, key, {
        discord: isDiscord,
        mention: isDiscord ? o.mention : undefined,
      });
      const itemPlan = typeof ev.plan === "string" ? ev.plan : undefined;
      enqueueQueue(db, {
        dedupe_key: `${row.id}:${channel}`,
        severity: "info",
        entity: typeof ev.plan === "string" ? ev.plan : undefined,
        text,
        target,
        plan: itemPlan,
        task: typeof ev.task === "string" ? ev.task : undefined,
        ts: typeof ev.ts === "string" ? ev.ts : undefined,
      });
      const drainRes = await drainQueue(db, {
        send: async (m: any) => {
          const items = Array.isArray(m?.items) ? m.items : [];
          const plans = [...new Set([itemPlan, ...items.map((it: any) => it?.plan)].filter((pl: any) => typeof pl === "string" && pl !== ""))];
          const inputThread = thread ?? (plans.length > 0 ? threadIfSaved(db, target, plans[0]) : undefined);
          const r = await o.send({ target: m.target, text: m.text, ...(inputThread ? { thread: inputThread } : {}) });
          if (r?.thread_id) {
            for (const pl of plans) saveThread(db, pl, target, r.thread_id);
          }
          return r;
        },
        target,
        targets: o.targets,
        mention: o.mention,
        rules: o.rules,
      });
      if ((drainRes?.delivered ?? drainRes?.sent ?? 0) > 0) sent = true;
    }
    markNotified(db, row.id);
    if (sent) routed++;
  }
  return { routed };
}

/** Thread já conhecida para este PLAN+target (plan_thread, TASK-01), ou nada. */
function threadIfSaved(db: Database, target: string, plan: unknown): string | undefined {
  if (typeof plan !== "string" || plan === "") return undefined;
  const row = db
    .query("SELECT thread_id FROM plan_thread WHERE plan = ? AND target = ?")
    .get(plan, target) as { thread_id: string | null } | null;
  return row?.thread_id ?? undefined;
}

function saveThread(db: Database, plan: string, target: string, threadId: string): void {
  db.run(
    "INSERT INTO plan_thread(plan, target, thread_id) VALUES(?, ?, ?) " +
      "ON CONFLICT(plan, target) DO UPDATE SET thread_id = excluded.thread_id",
    [plan, target, threadId],
  );
}

function markNotified(db: Database, id: string): void {
  db.run("INSERT OR IGNORE INTO notification_log(id, ts) VALUES(?, ?)", [
    id,
    new Date().toISOString(),
  ]);
}

/** Texto da mensagem: cita PLAN/TASK e, no blocker, a pergunta (05 §6). */
function composeText(
  ev: Record<string, any>,
  key: string,
  o: { discord: boolean; mention?: string },
): string {
  const where =
    [ev.plan ?? ev.spec ?? ev.intent, ev.task].filter((v) => typeof v === "string" && v !== "" && v !== "-").join("/") ||
    ev.kind;
  const data = ev.data ?? {};
  const question = typeof data.question === "string" ? data.question : "";
  const failure = typeof data.failure === "string" ? data.failure : "";
  let text: string;
  switch (key) {
    case "blocker":
      text = `🚧 Blocker em ${where}: ${question} — responda na thread`;
      break;
    case "task_blocked":
      text = `⛔ ${where} bloqueada: tentativas esgotadas`;
      break;
    case "approval":
      text = `⏸️ ${where} aguardando aprovação`;
      break;
    case "budget_warn":
      text = `⚠️ Orçamento de ${where}: US$ ${data.spent_usd} de ${data.cap_usd} (80% do teto)`;
      break;
    case "budget_cap":
      text = `🛑 Teto de orçamento atingido em ${where}: US$ ${data.spent_usd} ≥ ${data.cap_usd}`;
      break;
    case "retry":
      text = `🔁 ${where}: attempt falhou${failure ? ` (${failure})` : ""}; vai tentar de novo`;
      break;
    default:
      text = `🔔 ${ev.kind} em ${where}`;
  }
  if (o.discord && o.mention && o.mention !== "") text = `${o.mention} ${text}`;
  return text;
}
