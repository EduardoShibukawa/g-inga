// `ginga tick` (PLAN-0010 TASK-02): varre a fila (`[commands].queue`) e
// despacha cada TASK `open` sem `blocked_by` por `[commands].dispatch`
// (padrão `manda run {plan} --task {task}`). O claim é atômico entre processos:
// BEGIN IMMEDIATE + busy_timeout em task_exec marca `running` com lease
// (`lease_owner`, `lease_until` em epoch ms, renovado enquanto o despacho
// roda); no fim o lease é liberado e o status vira `dispatched` (exit 0,
// não despacha de novo) ou `failed` (exit ≠ 0, volta à fila). Lease vencido
// volta à fila; lease válido de outro dono bloqueia. Aqui só se decide QUANDO
// despachar: o que roda, com que runtime/modelo, é do `manda`.
//
// A renovação em tempo real precisa do event loop, então src/cli.ts usa este
// arquivo como worker (sync fachada → `bun src/tick.ts tick …`).

import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { Database } from "bun:sqlite";
import { emitEvent } from "./events/emit.ts";
import { getPhase, setPhase } from "./plan_phase.ts";
import { nextAction } from "./tick_plan.ts";

/** TTL do lease; vencido, outro tick pode assumir a TASK. */
const LEASE_TTL_MS = 60_000;
/** Renova o lease enquanto o despacho roda, a TTL/3. */
const RENEW_MS = LEASE_TTL_MS / 3;
/** Contenda entre ticks paralelos: espera em vez de quebrar com SQLITE_BUSY. */
const BUSY_TIMEOUT_MS = 10_000;

type QueueEntry = { ref: string; plan: string; task: string; state: string; blocked_by: string[] };
type Exec = { plan: string; task: string };
type Commands = { queue: string; dispatch: string; red?: string; run?: string; judge?: string; merge?: string; replan?: string; notify?: string };

const DEFAULT_COMMANDS: Commands = {
  queue: "pinga queue --json --root {root}",
  dispatch: "manda run {plan} --task {task}",
  red: "manda red {plan}",
  run: "manda run {plan} {task}",
  judge: "manda judge {plan}",
  merge: "bin/merge-gate.sh {plan}",
  replan: "manda replan {plan} {task}",
};

/** `queue = "…"`/`dispatch = "…"` da seção [commands] do project.toml. */
export function parseCommands(raw: string): Partial<Commands> {
  const cmds: Partial<Commands> = {};
  let section = "";
  for (const line of raw.split("\n")) {
    const head = line.match(/^\s*\[([^\]]+)\]\s*$/);
    if (head) {
      section = head[1]!.trim();
      continue;
    }
    const kv = line.match(/^\s*([A-Za-z0-9_-]+)\s*=\s*"(.*)"\s*$/);
    if (kv && section === "commands") {
      const key = kv[1]! as keyof Commands;
      if (key === "queue" || key === "dispatch" || key === "red" || key === "run" || key === "judge" || key === "merge" || key === "replan" || key === "notify") {
        cmds[key] = kv[2]!;
      }
    }
  }
  return cmds;
}

function readCommands(root: string): Commands {
  let raw = "";
  try {
    raw = readFileSync(join(root, ".ginga", "project.toml"), "utf8");
  } catch {
    // sem project.toml: valem os comandos padrão
  }
  return { ...DEFAULT_COMMANDS, ...parseCommands(raw) };
}

/** Substitui {plan}, {task} e {root} no comando configurado. */
function fill(command: string, vars: Record<string, string>): string {
  return command.replace(/\{(\w+)\}/g, (m, key: string) => (key in vars ? vars[key]! : m));
}

/** Lê o JSON da fila vindo do comando de queue configurado. */
export function readQueue(root: string, command: string): QueueEntry[] {
  const r = Bun.spawnSync(["/bin/sh", "-c", fill(command, { root })], { stdout: "pipe", stderr: "pipe" });
  if (r.exitCode !== 0) throw new Error(`queue saiu com ${r.exitCode ?? "sinal"}`);
  let parsed: unknown;
  try {
    parsed = JSON.parse(r.stdout.toString("utf8"));
  } catch {
    throw new Error("fila não é JSON");
  }
  const tasks = (parsed as { tasks?: unknown } | null)?.tasks;
  if (!Array.isArray(tasks)) throw new Error("fila sem 'tasks'");
  const out: QueueEntry[] = [];
  for (const raw of tasks) {
    if (typeof raw !== "object" || raw === null) continue;
    const o = raw as Record<string, unknown>;
    if (typeof o.task !== "string" || o.task === "") continue;
    out.push({
      ref: o.task,
      plan: typeof o.plan === "string" && o.plan !== "" ? o.plan : o.task.split("/")[0],
      task: o.task.includes("/") ? o.task.slice(o.task.lastIndexOf("/") + 1) : o.task,
      state: typeof o.state === "string" ? o.state : "",
      blocked_by: Array.isArray(o.blocked_by) ? o.blocked_by.filter((d): d is string => typeof d === "string") : [],
    });
  }
  return out;
}

type ExecRow = {
  status: string | null;
  attempts: number | null;
  lease_owner: string | null;
  lease_until: number | string | null;
};

function getRow(db: Database, exec: Exec): ExecRow | null {
  return db
    .query("SELECT status, attempts, lease_owner, lease_until FROM task_exec WHERE plan = ? AND task = ?")
    .get(exec.plan, exec.task) as ExecRow | null;
}

/** lease_until em epoch ms (número ou o texto da affinity TEXT da coluna). */
function leaseVivo(until: number | string | null, now: number): boolean {
  if (until === null) return false;
  const n = Number(until);
  return Number.isFinite(n) && n > now;
}

/** (Re)claim possível: sem row, `failed`, `running` sem lease ou lease vencido. */
function claimavel(row: ExecRow | null, now: number): boolean {
  if (row === null) return true;
  if (row.status === "dispatched") return false;
  if (row.status === "running" && leaseVivo(row.lease_until, now)) return false;
  return true;
}

/** Claim atômico: BEGIN IMMEDIATE decide dono; retry soma attempts, primeiro é 1. */
function claim(db: Database, exec: Exec, owner: string): boolean {
  const now = Date.now();
  db.run("BEGIN IMMEDIATE");
  try {
    const row = getRow(db, exec);
    if (!claimavel(row, now)) {
      db.run("ROLLBACK");
      return false;
    }
    const attempts = Number(row?.attempts ?? 0) + 1;
    if (row === null) {
      db.query(
        "INSERT INTO task_exec(plan, task, status, attempts, lease_owner, lease_until) VALUES(?, ?, 'running', ?, ?, ?)",
      ).run(exec.plan, exec.task, attempts, owner, now + LEASE_TTL_MS);
    } else {
      db.query(
        "UPDATE task_exec SET status = 'running', attempts = ?, lease_owner = ?, lease_until = ? WHERE plan = ? AND task = ?",
      ).run(attempts, owner, now + LEASE_TTL_MS, exec.plan, exec.task);
    }
    db.run("COMMIT");
    return true;
  } catch (e) {
    try {
      db.run("ROLLBACK");
    } catch {
      // sem transação aberta
    }
    console.error(`tick: claim de ${exec.plan}/${exec.task} falhou: ${(e as Error).message}`);
    return false;
  }
}

/** Renova o lease do dono atual (se ainda for o dono). */
function renovate(db: Database, exec: Exec, owner: string): void {
  try {
    db.query(
      "UPDATE task_exec SET lease_until = ? WHERE plan = ? AND task = ? AND lease_owner = ?",
    ).run(Date.now() + LEASE_TTL_MS, exec.plan, exec.task, owner);
  } catch {
    // melhor esforço: a próxima renovação cobre
  }
}

/** task pending → running, emitido por system. */
function emitTransition(exec: Exec): void {
  emitEvent({
    source: "ginga",
    kind: "transition",
    plan: exec.plan,
    task: exec.task,
    data: { entity: "task", from: "pending", to: "running", by: "system", via: "cli" },
  });
}

/** Roda o comando de dispatch no shell, renovando o lease até o fim. */
async function despachar(command: string, json: boolean, renew: () => void): Promise<number> {
  const child = Bun.spawn(["/bin/sh", "-c", command], {
    stdin: "ignore",
    stdout: json ? "ignore" : "inherit",
    stderr: json ? "ignore" : "inherit",
  });
  const timer = setInterval(renew, RENEW_MS);
  if (typeof timer === "object" && typeof timer.unref === "function") timer.unref();
  try {
    await child.exited;
    return child.exitCode ?? 1;
  } finally {
    clearInterval(timer);
  }
}

/** Fim do despacho: solta o lease e grava o resultado (dispatched | failed). */
function finalize(db: Database, exec: Exec, code: number): void {
  const status = code === 0 ? "dispatched" : "failed";
  db.run("BEGIN IMMEDIATE");
  try {
    db.query("UPDATE task_exec SET status = ?, lease_owner = NULL, lease_until = NULL WHERE plan = ? AND task = ?").run(
      status,
      exec.plan,
      exec.task,
    );
    db.run("COMMIT");
  } catch (e) {
    try {
      db.run("ROLLBACK");
    } catch {
      // sem transação aberta
    }
    console.error(`tick: salvar ${status} de ${exec.plan}/${exec.task} falhou: ${(e as Error).message}`);
  }
}

/** Schema completo do state.db, com `lease_until INTEGER`: o epoch ms precisa
 *  voltar como número para quem lê o banco (lease vivo é comparável a
 *  Date.now()). Demais tabelas idênticas ao contrato de src/state/db.ts;
 *  `IF NOT EXISTS` respeita um banco que já exista (com outra shape ou não). */
const STATE_DB_SCHEMA = `
CREATE TABLE IF NOT EXISTS task_exec (
  plan TEXT NOT NULL,
  task TEXT NOT NULL,
  status TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  lease_owner TEXT,
  lease_until INTEGER,
  PRIMARY KEY (plan, task)
);
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  ts TEXT,
  kind TEXT,
  plan TEXT,
  task TEXT,
  json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS offsets (
  path TEXT PRIMARY KEY,
  byte INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS plan_thread (
  plan TEXT NOT NULL,
  target TEXT NOT NULL,
  thread_id TEXT,
  PRIMARY KEY (plan, target)
);
CREATE TABLE IF NOT EXISTS plan_phase (
  plan TEXT PRIMARY KEY,
  phase TEXT,
  since TEXT,
  replans INTEGER NOT NULL DEFAULT 0
);
`;

/** Abre o state.db tolerando o open em corrida com outro tick (retry curto). */
function openDbForTick(path: string): Database {
  mkdirSync(dirname(path), { recursive: true });
  let last: Error | null = null;
  for (let i = 0; i < 50; i++) {
    try {
      const db = new Database(path);
      db.run(`PRAGMA busy_timeout = ${BUSY_TIMEOUT_MS}`);
      db.run(STATE_DB_SCHEMA);
      return db;
    } catch (e) {
      last = e as Error;
      Bun.sleepSync(10);
    }
  }
  throw last ?? new Error("state.db indisponível");
}

function getPlanTasksState(db: Database, plan: string) {
  // Try to get from task_exec or infer from queue context
  const rows = db
    .query("SELECT task, status, attempts FROM task_exec WHERE plan = ?")
    .all(plan) as Array<{ task: string; status: string | null; attempts: number | null }>;
  // Also need deps_done and blocked info - for now look up from queue? Or use sensible defaults
  return rows.map((r) => ({
    id: plan + "/" + r.task,
    status: (r.status === "dispatched" ? "pass" : r.status === "failed" ? "fail" : r.status === "blocked" ? "blocked" : "open") as any,
    attempts: Number(r.attempts ?? 0),
    deps_done: true,
  }));
}

/** Ponto de entrada do worker: `bun src/tick.ts tick […flags]`. */
export async function runTick(args: string[]): Promise<number> {
  let dryRun = false;
  let json = false;
  let root: string | undefined;
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a === "--dry-run") dryRun = true;
    else if (a === "--json") json = true;
    else if (a === "--root") root = args[++i];
    else if (a.startsWith("--root=")) root = a.slice("--root=".length);
    else {
      console.error(`uso: ginga tick [--dry-run] [--json] [--root D] (flag desconhecida: ${a})`);
      return 2;
    }
  }
  const base = root && root !== "" ? root : process.cwd();
  const commands = readCommands(base);

  let queue: QueueEntry[];
  try {
    queue = readQueue(base, commands.queue);
  } catch (e) {
    console.error(`tick: fila indisponível: ${(e as Error).message}`);
    return 1;
  }

  const dbPath =
    process.env.GINGA_STATE_DB && process.env.GINGA_STATE_DB !== ""
      ? process.env.GINGA_STATE_DB
      : join(base, ".ginga", "state", "state.db");
  const owner = `tick-${process.pid}`;

  let db: Database | null = null;
  const despachadas: string[] = [];
  try {
    // dry-run não grada nada: só a fila e, se o db já existir, leitura de lease.
    db = dryRun ? (existsSync(dbPath) ? openDbForTick(dbPath) : null) : openDbForTick(dbPath);
    
    // First, try phase-based tick for plans that have plan_phase
    if (db) {
      const plans = [...new Set(queue.map(q => q.plan))];
      for (const plan of plans) {
        const planPhase = getPhase(db, plan);
        if (!planPhase) continue; // not phase-managed
        // Build tasks state from queue entries for this plan
        const planEntries = queue.filter(q => q.plan === plan);
        const tasksState = planEntries.map(e => {
          // Try to get attempts from task_exec
          let attempts = 0;
          try {
            const row = db.query("SELECT attempts, status FROM task_exec WHERE plan = ? AND task = ?").get(plan, e.task) as any;
            if (row) {
              attempts = Number(row.attempts ?? 0);
            }
          } catch {}
          // Determine status
          let status: any = "open";
          if (e.state === "pass" || e.state === "done") status = "pass";
          else if (e.state === "fail") status = "fail";
          else if (e.state === "blocked") status = "blocked";
          else status = "open";
          return {
            id: e.ref,
            status,
            attempts,
            deps_done: (e.blocked_by?.length ?? 0) === 0,
          };
        });
        const action = nextAction({
          phase: planPhase.phase,
          tasks: tasksState,
          cap_ok: true, // assume ok for now
        });
        if (action.cmd === "none" || action.cmd === "notify") continue;
        // Execute action
        const cmdTemplate = (commands as any)[action.cmd];
        if (!cmdTemplate) continue;
        const cmdVars: Record<string, string> = { plan, root: base };
        if (action.task) cmdVars.task = action.task;
        const command = fill(cmdTemplate, cmdVars);
        if (dryRun) {
          despachadas.push(action.task ? `${plan}/${action.task}` : plan);
          continue;
        }
        const code = await despachar(command, json, () => {});
        if (code === 0) {
          despachadas.push(action.task ? `${plan}/${action.task}` : plan);
          if (!json) console.log(`despachado: ${action.task ? `${plan}/${action.task}` : plan}`);
          // Update phase based on action
          if (action.cmd === "red") {
            setPhase(db, plan, "red", "red");
          } else if (action.cmd === "run") {
            setPhase(db, plan, "tasks", "run");
          } else if (action.cmd === "judge") {
            setPhase(db, plan, "judge", "judge");
          } else if (action.cmd === "merge") {
            setPhase(db, plan, "done", "merge");
          } else if (action.cmd === "replan") {
            setPhase(db, plan, "replan", "replan");
          }
        } else {
          console.error(`tick: ${action.task ? `${plan}/${action.task}` : plan} saiu com ${code}`);
        }
        continue;
      }
    }
    
    for (const entry of queue) {
      if (entry.state !== "open" || entry.blocked_by.length > 0) continue;
      // Skip if this plan is phase-managed and we handled it above?
      if (db) {
        const pp = getPhase(db, entry.plan);
        if (pp) continue; // handled in phase-based logic
      }
      const exec: Exec = { plan: entry.plan, task: entry.task };
      if (dryRun) {
        const row = db ? getRow(db, exec) : null;
        if (claimavel(row, Date.now())) despachadas.push(entry.ref);
        continue;
      }
      if (!claim(db, exec, owner)) continue;
      emitTransition(exec);
      const command = fill(commands.dispatch, { plan: exec.plan, task: exec.task, root: base });
      const code = await despachar(command, json, () => renovate(db!, exec, owner));
      finalize(db!, exec, code);
      if (code === 0) {
        despachadas.push(entry.ref);
        if (!json) console.log(`despachado: ${entry.ref}`);
      } else {
        console.error(`tick: ${entry.ref} saiu com ${code} (failed: volta à fila)`);
      }
    }
  } finally {
    db?.close();
  }

  if (json) console.log(JSON.stringify({ dispatched: despachadas }));
  else if (dryRun) for (const ref of despachadas) console.log(`despacharia: ${ref}`);
  return 0;
}

if (import.meta.main) {
  process.exit(await runTick(process.argv.slice(2)));
}
