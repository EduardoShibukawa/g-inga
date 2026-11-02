import type { Database } from "bun:sqlite";
import { readFileSync } from "node:fs";
import { HANDOFF_AB_ARMS, HANDOFF_AB_EXPERIMENT } from "./store.ts";

type Arm = (typeof HANDOFF_AB_ARMS)[number];
type EventData = {
  run_id?: unknown;
  task?: unknown;
  arm?: unknown;
  passed?: unknown;
  cost_usd?: unknown;
  handoff_tokens?: unknown;
};
type BenchEvent = {
  v: number;
  ts: string;
  kind: "attempt" | "handoff";
  id: string;
  data: EventData;
};
type RunGroup = {
  id: string;
  arm: Arm;
  task: string;
  started: string;
  ended: string;
  events: BenchEvent[];
};
export type HandoffAbReportRow = {
  arm: string;
  runs: number;
  ftpr: number;
  cost_usd: number;
  handoff_tokens_avg: number | null;
};

function parseEvents(path: string): BenchEvent[] {
  const events: BenchEvent[] = [];
  for (const [index, line] of readFileSync(path, "utf8").split(/\r?\n/).entries()) {
    if (line.trim() === "") continue;
    const parsed = JSON.parse(line) as unknown;
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      throw new Error(`evento inválido na linha ${index + 1}: envelope deve ser objeto`);
    }
    const value = parsed as BenchEvent;
    if (value.kind !== "attempt" && value.kind !== "handoff") continue;
    if (value.v !== 1 || typeof value.id !== "string" || typeof value.ts !== "string") {
      throw new Error(`evento inválido na linha ${index + 1}: exige envelope v1 com id e ts`);
    }
    if (typeof value.data !== "object" || value.data === null) {
      throw new Error(`evento inválido na linha ${index + 1}: data deve ser objeto`);
    }
    if (value.kind === "attempt" && typeof value.data.passed !== "boolean") {
      throw new Error(`evento inválido na linha ${index + 1}: attempt exige data.passed`);
    }
    if (value.kind === "handoff" && typeof value.data.handoff_tokens !== "number") {
      throw new Error(`evento inválido na linha ${index + 1}: handoff exige data.handoff_tokens`);
    }
    if (typeof value.data.run_id !== "string" || value.data.run_id === "") {
      throw new Error(`evento na linha ${index + 1} sem data.run_id`);
    }
    events.push(value);
  }
  return events;
}

function groupRuns(events: BenchEvent[]): RunGroup[] {
  const grouped = new Map<string, BenchEvent[]>();
  for (const event of events) {
    const id = event.data.run_id as string;
    grouped.set(id, [...(grouped.get(id) ?? []), event]);
  }
  return [...grouped.entries()].map(([id, runEvents]) => {
    const explicitArms = new Set(runEvents.map((event) => event.data.arm).filter((arm) => arm !== undefined));
    if (explicitArms.size > 1) throw new Error(`run ${id} contém braços conflitantes`);
    const inferred = runEvents.some((event) => event.kind === "handoff") ? "ginga-handoff" : "native-compact";
    const arm = (explicitArms.values().next().value ?? inferred) as string;
    if (!HANDOFF_AB_ARMS.includes(arm as Arm)) throw new Error(`run ${id} tem braço inválido: ${arm}`);
    const task = runEvents.find((event) => typeof event.data.task === "string")?.data.task;
    if (typeof task !== "string" || task === "") throw new Error(`run ${id} sem data.task`);
    const timestamps = runEvents.map((event) => event.ts);
    return {
      id,
      arm: arm as Arm,
      task,
      started: timestamps.reduce((min, ts) => (ts < min ? ts : min)),
      ended: timestamps.reduce((max, ts) => (ts > max ? ts : max)),
      events: runEvents,
    };
  });
}

function existingEventIds(bench: Database): Set<string> {
  const ids = new Set<string>();
  for (const row of bench.query("SELECT json FROM event").all() as Array<{ json: string }>) {
    try {
      const event = JSON.parse(row.json) as { id?: unknown };
      if (typeof event.id === "string") ids.add(event.id);
    } catch {
      // Uma linha antiga corrompida não impede a importação das demais.
    }
  }
  return ids;
}

/** Importa eventos v1 de attempt/handoff, deduplicando runs e eventos. */
export function importHandoffAb(bench: Database, jsonlPath: string): { runs: number; events: number } {
  const groups = groupRuns(parseEvents(jsonlPath));
  return bench.transaction(() => {
    const seenEventIds = existingEventIds(bench);
    const insertRun = bench.prepare("INSERT INTO run(id, arm, task, started, ended) VALUES(?, ?, ?, ?, ?)");
    const updateRun = bench.prepare("UPDATE run SET arm = ?, task = ?, started = ?, ended = ? WHERE id = ?");
    const insertEvent = bench.prepare("INSERT OR IGNORE INTO event(run, ts, kind, json) VALUES(?, ?, ?, ?)");
    let runs = 0;
    let events = 0;
    for (const group of groups) {
      const current = bench.query("SELECT arm, task, started, ended FROM run WHERE id = ?").get(group.id) as {
        arm: string; task: string; started: string; ended: string;
      } | null;
      if (current) {
        if (current.arm !== group.arm && !(current.arm === "native-compact" && group.arm === "ginga-handoff")) {
          throw new Error(`run ${group.id} já está no braço ${current.arm}`);
        }
        updateRun.run(
          group.arm,
          group.task,
          current.started < group.started ? current.started : group.started,
          current.ended > group.ended ? current.ended : group.ended,
          group.id,
        );
      } else {
        insertRun.run(group.id, group.arm, group.task, group.started, group.ended);
        runs += 1;
      }
      for (const event of group.events) {
        if (seenEventIds.has(event.id)) continue;
        const result = insertEvent.run(group.id, event.ts, event.kind, JSON.stringify(event));
        if (result.changes > 0) {
          seenEventIds.add(event.id);
          events += 1;
        }
      }
    }
    return { runs, events };
  })();
}

/** Calcula FTPR, custo pós-corte e tokens médios de handoff por braço. */
export function handoffAbReport(bench: Database): HandoffAbReportRow[] {
  const arms = bench.query("SELECT id FROM arm WHERE experiment = ? ORDER BY id").all(HANDOFF_AB_EXPERIMENT) as Array<{ id: string }>;
  return arms.map(({ id: arm }) => {
    const runs = bench.query("SELECT id FROM run WHERE arm = ? ORDER BY id").all(arm) as Array<{ id: string }>;
    let firstPasses = 0;
    let cost = 0;
    const handoffTokens: number[] = [];
    for (const run of runs) {
      const rows = bench.query("SELECT ts, kind, json FROM event WHERE run = ? ORDER BY ts, rowid").all(run.id) as Array<{
        ts: string; kind: string; json: string;
      }>;
      const events = rows.map((row) => ({ ...row, data: (JSON.parse(row.json) as BenchEvent).data }));
      const cut = events.find((event) => event.kind === "handoff")?.ts;
      const attempts = events.filter((event) => event.kind === "attempt" && (cut === undefined || event.ts >= cut));
      if (attempts[0]?.data.passed === true) firstPasses += 1;
      for (const attempt of attempts) {
        const value = Number(attempt.data.cost_usd);
        if (Number.isFinite(value)) cost += value;
      }
      for (const event of events.filter((item) => item.kind === "handoff")) {
        const value = Number(event.data.handoff_tokens);
        if (Number.isFinite(value)) handoffTokens.push(value);
      }
    }
    return {
      arm,
      runs: runs.length,
      ftpr: runs.length === 0 ? 0 : firstPasses / runs.length,
      cost_usd: cost,
      handoff_tokens_avg: handoffTokens.length === 0 ? null : handoffTokens.reduce((sum, value) => sum + value, 0) / handoffTokens.length,
    };
  });
}
