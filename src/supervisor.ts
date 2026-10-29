// Supervisor de lanes do PLAN-0023 TASK-03. Cada lane = repo + comando.
// Roda o comando; em falha (exit != 0) reinicia com backoff crescente;
// em sucesso ou quando o repo não tem pendência, encerra a lane.
// Emite heartbeat / lane.round em $GINGA_EVENTS quando definido.

import { spawn } from "node:child_process";

export type Lane = {
  repo: string;
  command: string;
  cwd?: string;
};

export type SupervisorOptions = {
  root?: string;
  backoffBaseMs?: number;
  backoffMaxMs?: number;
  maxRestarts?: number;
  queueCommand?: string;
  pendingCheck?: (repo: string) => boolean | Promise<boolean>;
  sleep?: (ms: number) => Promise<void>;
  spawn?: (cmd: string, opts: { cwd?: string; env?: Record<string, string | undefined> }) => any;
  emit?: (ev: Record<string, unknown>) => void;
  stopped?: { value: boolean };
};

export type SupervisorResult = { repo: string; runs: number; stoppedReason: string };

const sleepDefault = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function emitDefault(ev: Record<string, unknown>) {
  try {
    // lazy import to avoid circular
    const m = require("./events/emit.ts");
    m.emitEvent(ev);
  } catch {
    // best-effort
  }
}

// Lazy emit to avoid import cycles
async function doEmit(ev: Record<string, unknown>, emit?: (e: any) => void) {
  if (emit) {
    try { emit(ev); } catch {}
    return;
  }
  try {
    const { emitEvent } = await import("./events/emit.ts");
    emitEvent(ev);
  } catch {}
}

function fillCmd(cmd: string, vars: Record<string, string>): string {
  return cmd.replace(/\{(\w+)\}/g, (m, key: string) => (key in vars ? vars[key]! : m));
}

async function hasPending(lane: Lane, opts: SupervisorOptions): Promise<boolean> {
  if (opts.pendingCheck) {
    try {
      return Boolean(await opts.pendingCheck(lane.repo));
    } catch {
      return true;
    }
  }
  const cmd = opts.queueCommand;
  if (!cmd) return true;
  const root = opts.root ?? process.cwd();
  try {
    const filled = fillCmd(cmd, { root, repo: lane.repo });
    const r = Bun.spawnSync(["/bin/sh", "-c", filled], { stdout: "pipe", stderr: "pipe" });
    if (r.exitCode !== 0) return true;
    const parsed = JSON.parse(r.stdout.toString("utf8") || "{}");
    const tasks = Array.isArray(parsed?.tasks) ? parsed.tasks : [];
    return tasks.some((t: any) => {
      const st = typeof t?.state === "string" ? t.state : "";
      if (st !== "" && st !== "open" && st !== "pending") return false;
      const plan = typeof t?.plan === "string" ? t.plan : (typeof t?.task === "string" ? t.task.split("/")[0] : "");
      return plan === lane.repo || plan.startsWith(lane.repo);
    });
  } catch {
    return true;
  }
}

export class Supervisor {
  lanes: Lane[];
  opts: SupervisorOptions;
  private stopFlag = { value: false };
  private controllers: { stop: () => void }[] = [];

  constructor(lanes: Lane[] | any, opts: SupervisorOptions = {}) {
    this.lanes = Array.isArray(lanes) ? lanes : [];
    this.opts = { ...opts, stopped: this.stopFlag };
    if (opts.stopped) this.stopFlag = opts.stopped;
  }

  stop() {
    this.stopFlag.value = true;
  }

  async run(): Promise<SupervisorResult[]> {
    const results = await Promise.all(this.lanes.map((lane) => this.runLane(lane)));
    return results;
  }

  private async runLane(lane: Lane): Promise<SupervisorResult> {
    const opts = this.opts;
    const sleep = opts.sleep ?? sleepDefault;
    const base = opts.backoffBaseMs ?? 50;
    const maxMs = opts.backoffMaxMs ?? 1000;
    const maxRestarts = opts.maxRestarts ?? 3;
    const root = opts.root ?? process.cwd();
    const spawnFn =
      opts.spawn ??
      ((cmd: string, o: any) => {
        const child = spawn("/bin/sh", ["-c", cmd], {
          cwd: o?.cwd ?? root,
          env: { ...process.env, ...(o?.env ?? {}) },
          stdio: ["ignore", "pipe", "pipe"],
        });
        return child;
      });

    let backoff = base;
    let restarts = 0;
    let runs = 0;
    let stoppedReason = "max_restarts";

    while (!this.stopFlag.value) {
      const pending = await hasPending(lane, opts);
      if (!pending) {
        await doEmit({ source: "ginga", kind: "lane.round", data: { lane: lane.repo, phase: "end", reason: "no_pending" } }, opts.emit);
        stoppedReason = "no_pending";
        break;
      }

      await doEmit({ source: "ginga", kind: "lane.round", data: { lane: lane.repo, phase: "start" } }, opts.emit);

      const child = spawnFn(lane.command, { cwd: lane.cwd ?? root });
      runs++;
      const exitCode: number = await new Promise((resolve) => {
        child.on("exit", (code: number | null) => resolve(code ?? 1));
        child.on("error", () => resolve(1));
      });

      if (exitCode === 0) {
        await doEmit({ source: "ginga", kind: "heartbeat", data: { entity: `lane:${lane.repo}`, pid: process.pid, progress: runs } }, opts.emit);
        await doEmit({ source: "ginga", kind: "lane.round", data: { lane: lane.repo, phase: "end" } }, opts.emit);
        backoff = base;
        restarts = 0;
        // small pause to avoid tight loop when always pending
        await sleep(0);
        continue;
      }

      restarts++;
      await doEmit({ source: "ginga", kind: "lane.round", data: { lane: lane.repo, phase: "end", code: exitCode } }, opts.emit);
      if (restarts > maxRestarts) {
        stoppedReason = "max_restarts";
        break;
      }
      await sleep(backoff);
      backoff = Math.min(backoff * 2, maxMs);
    }

    if (this.stopFlag.value) stoppedReason = "stopped";
    return { repo: lane.repo, runs, stoppedReason };
  }
}

// Functional aliases
export function supervise(lanes: Lane[], opts?: SupervisorOptions): Supervisor {
  return new Supervisor(lanes, opts);
}
export const superviseLanes = supervise;
export async function runSupervisor(lanes: Lane[], opts?: SupervisorOptions): Promise<SupervisorResult[]> {
  return new Supervisor(lanes, opts).run();
}
export function createSupervisor(lanes: Lane[], opts?: SupervisorOptions): Supervisor {
  return new Supervisor(lanes, opts);
}

// Config parsing
export function parseSupervisorConfig(raw: string): {
  lanes: Lane[];
  backoffBaseMs: number;
  backoffMaxMs: number;
  maxRestarts: number;
} {
  const lanes: Lane[] = [];
  let backoffBaseMs = 50;
  let backoffMaxMs = 1000;
  let maxRestarts = 3;
  let section = "";
  let current: Partial<Lane> | null = null;
  const flush = () => {
    if (current && current.repo && current.command) lanes.push({ repo: current.repo, command: current.command, cwd: current.cwd });
    current = null;
  };
  for (const line of raw.split("\n")) {
    const head = line.match(/^\s*\[([^\]]+)\]\s*$/);
    if (head) {
      flush();
      section = head[1].trim();
      if (section === "supervisor.lane") current = {};
      continue;
    }
    const kv = line.match(/^\s*([A-Za-z0-9_-]+)\s*=\s*(.+?)\s*$/);
    if (!kv) continue;
    const key = kv[1];
    const val = kv[2].trim();
    const unq = (v: string) => v.replace(/^"(.*)"$/, "$1");
    if (section === "supervisor") {
      if (key === "backoff_base_ms" || key === "backoff_base") backoffBaseMs = Number(unq(val)) || backoffBaseMs;
      if (key === "backoff_max_ms" || key === "backoff_max") backoffMaxMs = Number(unq(val)) || backoffMaxMs;
      if (key === "max_restarts") maxRestarts = Number(unq(val)) || maxRestarts;
      if (key === "lanes") {
        // array form
        if (val.startsWith("[")) {
          const inner = val.slice(1, val.endsWith("]") ? -1 : undefined);
          for (const part of inner.split(",")) {
            const s = unq(part.trim());
            if (!s) continue;
            const eq = s.indexOf("=");
            if (eq > 0) lanes.push({ repo: s.slice(0, eq).trim(), command: s.slice(eq + 1).trim() });
          }
        } else {
          const s = unq(val);
          // comma or semicolon separated
          for (const part of s.split(/[;,]/)) {
            const p = part.trim();
            if (!p) continue;
            const eq = p.indexOf("=");
            if (eq > 0) lanes.push({ repo: p.slice(0, eq).trim(), command: p.slice(eq + 1).trim() });
          }
        }
      }
    }
    if (section === "supervisor.lanes") {
      // mapping repo = command
      if (val.startsWith('"')) {
        lanes.push({ repo: key, command: unq(val) });
      }
    }
    if (current && section === "supervisor.lane") {
      if (key === "repo") current.repo = unq(val);
      if (key === "command") current.command = unq(val);
      if (key === "cwd") current.cwd = unq(val);
    }
  }
  flush();
  return { lanes, backoffBaseMs, backoffMaxMs, maxRestarts };
}

// Also export default
export default { Supervisor, supervise, superviseLanes, runSupervisor, parseSupervisorConfig };
