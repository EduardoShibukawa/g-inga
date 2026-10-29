// Supervisor de lanes do PLAN-0023 TASK-03. Cada lane = repo + comando.
// Roda o comando; em falha (exit != 0) reinicia com backoff crescente;
// em sucesso ou quando o repo não tem pendência, encerra a lane.
// Emite heartbeat / lane.round em $GINGA_EVENTS quando definido.

import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";

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
  progressCheck?: (lane: Lane) => number | Promise<number>;
  heartbeatMs?: number;
  idleCooldownMs?: number;
  restartCooldownMs?: number;
  freeExhaustedFile?: string;
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

// TASK-26 / T117: lacuna do corte (d). Pendência padrão do supervisor, sem
// pendingCheck injetado: backlog com linha `- [ ]`, arquivo ready/<repo>.json
// direto em algum plano, ou fila (queueCommand) indicando pendência. Sem
// queueCommand e sem as duas fontes de arquivo: não pendente (antes devolvia
// true, o que religava lanes ociosas em laço quente).
function backlogHasPending(root: string, repo: string): boolean {
  try {
    const text = readFileSync(join(root, ".ginga", "prompts", `backlog-${repo}.md`), "utf8");
    return /^- \[ \]/m.test(text);
  } catch {
    return false; // sem arquivo de backlog: nada pendente por aqui
  }
}

function hasReadyFile(root: string, repo: string): boolean {
  // Só `<plan>/ready/<repo>.json` direto; `ready/done/<repo>.json` não vale.
  const plansDir = join(root, ".ginga", "plans");
  let entries: string[];
  try {
    entries = readdirSync(plansDir);
  } catch {
    return false;
  }
  for (const plan of entries) {
    try {
      if (statSync(join(plansDir, plan, "ready", `${repo}.json`)).isFile()) return true;
    } catch {
      // esse plano não tem o arquivo pronto
    }
  }
  return false;
}

async function queueHasPending(lane: Lane, opts: SupervisorOptions, root: string): Promise<boolean> {
  const cmd = opts.queueCommand;
  if (!cmd) return false;
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
    return true; // fila configurada e falhou ⇒ pendente
  }
}

async function hasPending(lane: Lane, opts: SupervisorOptions): Promise<boolean> {
  if (opts.pendingCheck) {
    try {
      return Boolean(await opts.pendingCheck(lane.repo));
    } catch {
      return true;
    }
  }
  const root = opts.root ?? process.cwd();
  if (backlogHasPending(root, lane.repo)) return true;
  if (hasReadyFile(root, lane.repo)) return true;
  return queueHasPending(lane, opts, root);
}

// TASK-23 / T114: cooldown de ociosidade entre rodadas. Dorme idleCooldownMs
// antes do próximo spawn, mas acorda cedo se a lane perder a pendência ou se o
// supervisor for parado: o cooldown evita religar em laço quente, não atrasa o
// encerramento.
async function idleSleep(
  ms: number,
  lane: Lane,
  opts: SupervisorOptions,
  sleep: (ms: number) => Promise<void>,
  stopFlag: { value: boolean },
): Promise<void> {
  let timer: ReturnType<typeof setInterval> | null = null;
  const wake = new Promise<void>((resolve) => {
    timer = setInterval(() => {
      if (stopFlag.value) return resolve();
      void hasPending(lane, opts).then((p) => {
        if (!p) resolve();
      });
    }, 1000);
  });
  try {
    await Promise.race([sleep(ms), wake]);
  } finally {
    if (timer) clearInterval(timer);
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
    const base = opts.backoffBaseMs ?? 60_000;
    const maxMs = opts.backoffMaxMs ?? 600_000;
    const maxRestarts = opts.maxRestarts ?? 3;
    const idleMs = opts.idleCooldownMs ?? 600_000;
    const restartCooldownMs = opts.restartCooldownMs ?? 1_800_000;
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

      // TASK-23 / T114: progresso lido antes do spawn, para comparar com o
      // valor depois da saída (decisão de cooldown de ociosidade).
      const progressBefore = opts.progressCheck ? await opts.progressCheck(lane) : null;

      const child = spawnFn(lane.command, { cwd: lane.cwd ?? root });
      runs++;

      // PID do filho para o heartbeat (TASK-21 / T112): só um inteiro > 0 vale;
      // sem pid conhecido (mock de teste sem `pid`) usa 0 (desconhecido), nunca process.pid.
      const rawPid = (child as any).pid;
      const childPid = typeof rawPid === "number" && Number.isInteger(rawPid) && rawPid > 0 ? rawPid : 0;

      // Heartbeat periódico enquanto o filho roda (TASK-20 / T111).
      // Chama progressCheck a cada heartbeatMs e emite heartbeat com alive:true.
      // Sem sobreposição (uma checagem por vez); erro do progressCheck não derruba
      // a lane. O intervalo é limpo em qualquer caminho de saída do filho.
      const heartbeatMs = opts.heartbeatMs ?? 30000;
      let childDone = false;
      let hbBusy = false;
      const hbTimer = setInterval(() => {
        if (childDone || hbBusy || !opts.progressCheck) return;
        hbBusy = true;
        Promise.resolve()
          .then(() => opts.progressCheck!(lane))
          .then((p) => {
            if (childDone) return;
            return doEmit(
              {
                source: "ginga",
                kind: "heartbeat",
                data: { entity: `lane:${lane.repo}`, pid: childPid, progress: p, alive: true },
              },
              opts.emit,
            );
          })
          .catch(() => {
            // progressCheck falhou: mantém a lane viva, tenta de novo no próximo tick
          })
          .finally(() => {
            hbBusy = false;
          });
      }, heartbeatMs);

      const exitCode: number = await new Promise((resolve) => {
        child.on("exit", (code: number | null) => {
          childDone = true;
          clearInterval(hbTimer);
          resolve(code ?? 1);
        });
        child.on("error", () => {
          childDone = true;
          clearInterval(hbTimer);
          resolve(1);
        });
      });

      // TASK-24 / T115: códigos especiais de saída — não são falha comum.
      // exit 20 (main movida fora do gate, como no lane.sh): para a lane em
      // definitivo com alerta crítico e não consome restarts.
      if (exitCode === 20) {
        await doEmit({ source: "ginga", kind: "lane.round", data: { lane: lane.repo, phase: "end", code: exitCode } }, opts.emit);
        await doEmit(
          {
            source: "ginga",
            kind: "alert",
            data: {
              rule_id: "main_moved_outside_gate",
              severity: "critical",
              entity: `lane:${lane.repo}`,
              summary: `lane ${lane.repo} parada: main movida fora do gate (exit 20)`,
            },
          },
          opts.emit,
        );
        stoppedReason = "main_moved";
        break;
      }

      // exit 4 (cota free esgotada): pausa até fechar a janela de 60 min desde
      // o arquivo de esgotamento, sem consumir restarts e sem novo spawn na
      // janela; ao voltar ao topo do laço a pendência é reconferida.
      if (exitCode === 4) {
        await doEmit({ source: "ginga", kind: "lane.round", data: { lane: lane.repo, phase: "end", code: exitCode } }, opts.emit);
        const FREE_WINDOW_MS = 3_600_000;
        const pauseFile = opts.freeExhaustedFile ?? join(root, ".ginga", "handoffs", ".free-esgotado");
        let ageMs = 0;
        try {
          ageMs = Date.now() - statSync(pauseFile).mtimeMs;
        } catch {
          try {
            mkdirSync(dirname(pauseFile), { recursive: true });
            writeFileSync(pauseFile, "");
          } catch {
            // arquivo não pôde ser criado: ainda assim vale a pausa completa
          }
        }
        await sleep(Math.max(0, FREE_WINDOW_MS - ageMs));
        continue;
      }

      const progress = opts.progressCheck ? await opts.progressCheck(lane) : 0;
      if (exitCode === 0) {
        await doEmit({ source: "ginga", kind: "heartbeat", data: { entity: `lane:${lane.repo}`, pid: childPid, progress } }, opts.emit);
        await doEmit({ source: "ginga", kind: "lane.round", data: { lane: lane.repo, phase: "end" } }, opts.emit);
        backoff = base;
        restarts = 0;
        // TASK-23 / T114: saída 0 sem progresso (sem progressCheck conta como
        // sem progresso) espera idle_cooldown_ms antes de religar; com
        // progresso, mantém a pausa curta de sempre.
        const noProgress = progressBefore === null || progress <= progressBefore;
        if (noProgress) {
          await idleSleep(idleMs, lane, opts, sleep, this.stopFlag);
        } else {
          // small pause to avoid tight loop when always pending
          await sleep(0);
        }
        continue;
      }

      restarts++;
      await doEmit({ source: "ginga", kind: "lane.round", data: { lane: lane.repo, phase: "end", code: exitCode } }, opts.emit);
      // TASK-25 / T116: lacuna do corte (c). Estourar max_restarts com pendência
      // não mata a lane: espera restart_cooldown_ms (padrão 30 min), zera o
      // contador e o backoff e volta ao topo, onde a pendência é reconferida.
      // A lane só encerra por no_pending, stopped ou main_moved.
      if (restarts > maxRestarts) {
        await sleep(restartCooldownMs);
        restarts = 0;
        backoff = base;
        continue;
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
  idleCooldownMs: number;
  restartCooldownMs: number;
} {
  const lanes: Lane[] = [];
  let backoffBaseMs = 60_000;
  let backoffMaxMs = 600_000;
  let maxRestarts = 3;
  let idleCooldownMs = 600_000;
  let restartCooldownMs = 1_800_000;
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
      if (key === "idle_cooldown_ms") idleCooldownMs = Number(unq(val)) || idleCooldownMs;
      if (key === "restart_cooldown_ms") restartCooldownMs = Number(unq(val)) || restartCooldownMs;
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
  return { lanes, backoffBaseMs, backoffMaxMs, maxRestarts, idleCooldownMs, restartCooldownMs };
}

// TASK-07: alterna entre operador LLM e tick direto
export function childArgv(cfg: { mode: "tick" | "operador"; repo: string }): string[] {
  if (cfg.mode === "tick") {
    return ["ginga", "tick", "--loop", "--repo", cfg.repo];
  }
  return ["manda", "lane", cfg.repo];
}

// Also export default
export default {
  Supervisor,
  supervise,
  superviseLanes,
  runSupervisor,
  parseSupervisorConfig,
  childArgv,
};
