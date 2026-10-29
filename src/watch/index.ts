export * from "./rules.ts";
export * from "./evaluate.ts";
export * from "./ready.ts";
export { parseRulesToml } from "./rules.ts";
export { evaluateWatch } from "./evaluate.ts";
export { defaultRules } from "./rules.ts";
export { sweepReady } from "./ready.ts";

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { emitEvent } from "../events/emit.ts";
import { enqueue } from "../notify/queue.ts";
import { openStateDb, resolveStateDbPath } from "../state/db.ts";
import { parseRulesToml, defaultRules } from "./rules.ts";
import { evaluateWatch } from "./evaluate.ts";
import { sweepReady } from "./ready.ts";

function readJsonl(path: string): any[] {
  const raw = readFileSync(path, "utf8");
  return raw.trim().split("\n").filter((l) => l.trim() !== "").map((l) => JSON.parse(l));
}

export function watchCmd(args: string[]): number {
  let root: string | undefined;
  let eventsPath: string | undefined;
  let json = false;
  let testFile: string | undefined;
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a === "--root") { root = args[++i]; continue; }
    if (a.startsWith("--root=")) { root = a.slice("--root=".length); continue; }
    if (a === "--events") { eventsPath = args[++i]; continue; }
    if (a.startsWith("--events=")) { eventsPath = a.slice("--events=".length); continue; }
    if (a === "--json") { json = true; continue; }
    if (a === "--test") { testFile = args[++i]; continue; }
    if (a.startsWith("--test=")) { testFile = a.slice("--test=".length); continue; }
  }
  const base = root && root !== "" ? root : process.cwd();

  let events: any[] = [];
  if (testFile) {
    try { events = readJsonl(testFile); } catch { events = []; }
  } else if (eventsPath) {
    try { events = readJsonl(eventsPath); } catch { events = []; }
  } else {
    try {
      const db = openStateDb(resolveStateDbPath(base));
      const rows = db.query("SELECT json FROM events").all() as { json: string }[];
      events = rows.map((r) => { try { return JSON.parse(r.json); } catch { return null; } }).filter(Boolean);
      db.close();
    } catch {}
    if (events.length === 0 && process.env.GINGA_EVENTS) {
      try { events = readJsonl(process.env.GINGA_EVENTS!); } catch {}
    }
  }

  let rules: any[] = defaultRules();
  let customRules = false;
  const rulesPath = join(base, ".ginga", "watch", "rules.toml");
  if (existsSync(rulesPath)) {
    try {
      const parsed = parseRulesToml(readFileSync(rulesPath, "utf8"));
      if (parsed.rules.length > 0) { rules = parsed.rules; customRules = true; }
    } catch {}
  }

  const alerts = evaluateWatch(events, rules);

  // Sweep de ready/ (stale_ready + ready_writer): ligado por padrão (as regras padrão de
  // defaultRules() ficam em 6, tests_frozen) e, com rules.toml próprio, só se ele listar o id.
  // Idempotente entre ticks: o stale move o arquivo; a deduplicação abaixo usa os dedupe_keys.
  const hasRule = (id: string) => !customRules || rules.some((r: any) => r && r.id === id);
  if (hasRule("stale_ready") || hasRule("ready_writer")) {
    try {
      for (const a of sweepReady(base)) {
        if (hasRule(a.rule_id)) alerts.push(a);
      }
    } catch {}
  }

  // Idempotencia entre ticks: nao reemitir alerta cujo dedupe_key ja foi
  // emitido (evento kind=alert presente no conjunto de eventos lido).
  const existingAlertKeys = new Set(
    (Array.isArray(events) ? events : [])
      .filter((e: any) => e && e.kind === "alert")
      .map((e: any) => String(e?.data?.dedupe_key ?? ""))
      .filter((k: string) => k !== ""),
  );

  for (const a of alerts) {
    if (existingAlertKeys.has(a.dedupe_key)) continue;
    try {
      emitEvent({ source: "ginga", kind: "alert", data: { rule_id: a.rule_id, severity: a.severity, entity: a.entity, summary: a.summary, dedupe_key: a.dedupe_key, actions: a.actions } });
    } catch {}
  }
  // Fila durável: alertas entram na notification_queue para entrega pelo menos uma vez.
  try {
    const db = openStateDb(resolveStateDbPath(base));
    for (const a of alerts) {
      if (existingAlertKeys.has(a.dedupe_key)) continue;
      try {
        enqueue(db, { dedupe_key: a.dedupe_key, severity: a.severity, entity: a.entity, summary: a.summary, text: a.summary });
      } catch {}
    }
    db.close();
  } catch {}

  if (json) {
    console.log(JSON.stringify(alerts));
  } else {
    for (const a of alerts) console.log(`alert: ${a.rule_id} ${a.severity} ${a.entity}: ${a.summary}`);
  }
  return 0;
}

export const runWatch = watchCmd;
