export type WatchRule = {
  id: string;
  signal?: string;
  condition?: string;
  window_minutes?: number;
  threshold?: number | string;
  action?: string;
  severity?: string;
  discord?: string;
  dedupe_minutes?: number;
  fixture?: string;
  [k: string]: any;
};

function parseValue(v: string): any {
  v = v.trim();
  if (v.startsWith('"') && v.endsWith('"')) return v.slice(1, -1);
  if (v.startsWith("'") && v.endsWith("'")) return v.slice(1, -1);
  if (v.startsWith("[")) {
    const inner = v.slice(1, v.endsWith("]") ? -1 : undefined).trim();
    if (inner === "") return [];
    return inner.split(",").map((s) => parseValue(s.trim()));
  }
  if (v === "true") return true;
  if (v === "false") return false;
  const n = Number(v);
  if (Number.isFinite(n) && v !== "") return n;
  return v;
}

export function parseRulesToml(raw: string): { version: number; rules: WatchRule[] } {
  let version = 1;
  const rules: WatchRule[] = [];
  let current: WatchRule | null = null;
  for (const rawLine of raw.split(/\r?\n/)) {
    const hash = rawLine.indexOf("#");
    let line = hash < 0 ? rawLine : rawLine.slice(0, hash);
    line = line.trim();
    if (line === "") continue;
    const arr = /^\[\[([^\]]+)\]\]$/.exec(line);
    if (arr) {
      if (arr[1].trim() === "rule") {
        current = { id: "" };
        rules.push(current);
      } else {
        current = null;
      }
      continue;
    }
    const sec = /^\[([^\]]+)\]$/.exec(line);
    if (sec) {
      current = null;
      continue;
    }
    const kv = /^([^=]+)=(.*)$/.exec(line);
    if (!kv) continue;
    const key = kv[1].trim();
    const value = kv[2].trim();
    if (current === null) {
      if (key === "version") {
        const n = parseValue(value);
        if (typeof n === "number") version = n;
      }
      continue;
    }
    current[key] = parseValue(value);
  }
  return { version, rules: rules.filter((r) => r.id !== undefined && r.id !== "") };
}

export function defaultRules(): WatchRule[] {
  return [
    { id: "no_progress", signal: "heartbeat", action: "kill_and_retry", severity: "high", discord: "on_repeat", dedupe_minutes: 60, window_minutes: 30, threshold: 1, condition: "progress unchanged" },
    { id: "lane_dead", signal: "heartbeat", action: "restart_lane", severity: "high", discord: "on_repeat", dedupe_minutes: 30, window_minutes: 5, threshold: 1, condition: "lane dead" },
    { id: "main_moved_outside_gate", signal: "heartbeat", action: "alert_critical", severity: "critical", discord: "always", dedupe_minutes: 30, window_minutes: 0, threshold: 1, condition: "main moved without gate" },
    { id: "judge_shopping", signal: "receipt", action: "alert", severity: "warn", discord: "none", dedupe_minutes: 30, window_minutes: 0, threshold: 2, condition: "multiple judge verdicts same head" },
    { id: "report_mismatch", signal: "receipt", action: "alert", severity: "warn", discord: "none", dedupe_minutes: 30, window_minutes: 0, threshold: 1, condition: "pass claimed but receipt failed" },
    { id: "goal_reached", signal: "gate.result", action: "notify_done", severity: "info", discord: "always", dedupe_minutes: 0, window_minutes: 0, threshold: 1, condition: "all gates pass + alvo ok" },
  ];
}
