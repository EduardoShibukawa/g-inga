export * from "./rules.ts";
export * from "./evaluate.ts";
export { parseRulesToml } from "./rules.ts";
export { evaluateWatch } from "./evaluate.ts";
export { defaultRules } from "./rules.ts";

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { emitEvent } from "../events/emit.ts";
import { enqueue } from "../notify/queue.ts";
import { openStateDb, resolveStateDbPath } from "../state/db.ts";
import { parseRulesToml, defaultRules } from "./rules.ts";
import { evaluateWatch } from "./evaluate.ts";

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
  const rulesPath = join(base, ".ginga", "watch", "rules.toml");
  if (existsSync(rulesPath)) {
    try {
      const parsed = parseRulesToml(readFileSync(rulesPath, "utf8"));
      if (parsed.rules.length > 0) rules = parsed.rules;
    } catch {}
  }

  const alerts = evaluateWatch(events, rules);

  for (const a of alerts) {
    try {
      emitEvent({ source: "ginga", kind: "alert", data: { rule_id: a.rule_id, severity: a.severity, entity: a.entity, summary: a.summary, dedupe_key: a.dedupe_key, actions: a.actions } });
    } catch {}
  }
  // Fila durável: alertas entram na notification_queue para entrega pelo menos uma vez.
  try {
    const db = openStateDb(resolveStateDbPath(base));
    for (const a of alerts) {
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
