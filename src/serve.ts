// `ginga serve` (PLAN-0010 TASK-03): daemon que mantém o loop de tick vivo sem
// depender de um timer externo. O QUE despachar continua sendo decidido pela
// MESMA função do `ginga tick` (runTick de src/tick.ts) — aqui só se decide
// QUANDO rodá-la: por intervalo (`[serve].tick_seconds`) e por evento
// (`fs.watch` em $GINGA_EVENTS, com debounce; um tick em curso coloca o
// próximo na fila). A API do registro (PLAN-0011) serve sobre o bundle
// <root>/.ginga: sem auth configurada (GINGA_TOKEN, [serve].token_file ou
// [serve].allow — TASK-04) o bind é forçado em 127.0.0.1 e `--host` diferente
// sai com 2 citando auth; com auth, qualquer host vale e toda requisição
// precisa de Bearer token ou IP na allowlist.
//
// O serve roda para sempre e precisa do event loop, então src/cli.ts usa este
// arquivo como worker (sync fachada → `bun src/serve.ts serve …`).

import { existsSync, readFileSync, watch } from "node:fs";
import { join, resolve } from "node:path";
import { runTick } from "./tick.ts";
import { parseCommands } from "./tick.ts";
import { Supervisor, parseSupervisorConfig } from "./supervisor.ts";
import { runWatch } from "./watch.ts";
export * from "./supervisor.ts";
import { routeEvents } from "./notify/router.ts";
import { send as portSend } from "./notify/port.ts";
import { openStateDb, resolveStateDbPath } from "./state/db.ts";
import { ingestEvents } from "./state/ingest.ts";
import { startApi } from "./api/server.ts";

/** Bind sem auth (TASK-04): só loopback; fora daqui, só com credencial. */
const DEFAULT_HOST = "127.0.0.1";
/** Porta padrão; a 4242 é do painel do pinga. */
const DEFAULT_PORT = 4243;
/** Padrão do [serve].tick_seconds quando project.toml não diz (1 min). */
const DEFAULT_TICK_SECONDS = 60;
/** Janela de debounce do fs.watch: rajadas de appends viram um tick só. */
const DEBOUNCE_MS = 300;
/** Watchdog: se o pai mudar (mudou de PID), o worker foi órfão e sai. */
const WATCHDOG_MS = 2_000;

export type ServeConfig = {
  tick_seconds: number;
  port: number;
  /** `[serve].token_file`: caminho do arquivo com o token da API (TASK-04). */
  token_file?: string;
  /** `[serve].allow = ["100.64.0.0/10", …]`: CIDRs IPv4 que entram sem token. */
  allow?: string[];
};

/** `[serve].tick_seconds = N` / `[serve].port = N` (números, com ou sem
 *  aspas), `[serve].token_file = "caminho"` e `[serve].allow = ["cidr", …]`
 *  do project.toml. Outras seções/valores são ignorados. */
export function parseServeConfig(raw: string): Partial<ServeConfig> {
  const cfg: Partial<ServeConfig> = {};
  let section = "";
  for (const line of raw.split("\n")) {
    const head = line.match(/^\s*\[([^\]]+)\]\s*$/);
    if (head) {
      section = head[1]!.trim();
      continue;
    }
    const kv = section === "serve" ? line.match(/^\s*([A-Za-z0-9_-]+)\s*=\s*(.+?)\s*$/) : null;
    if (!kv) continue;
    const key = kv[1]!;
    const val = kv[2]!;
    if (key === "tick_seconds" || key === "port") {
      const num = Number(val.replace(/^"(.*)"$/, "$1"));
      if (!Number.isFinite(num)) continue;
      if (key === "tick_seconds") cfg.tick_seconds = num;
      else cfg.port = num;
    } else if (key === "token_file") {
      const s = unquote(val);
      if (s !== "") cfg.token_file = s;
    } else if (key === "allow") {
      const list = channelList(val);
      if (list.length > 0) cfg.allow = list;
    }
  }
  return cfg;
}

function readServeConfig(root: string): ServeConfig {
  let raw = "";
  try {
    raw = readFileSync(join(root, ".ginga", "project.toml"), "utf8");
  } catch {
    // sem project.toml: valem os padrões
  }
  const c = parseServeConfig(raw);
  return {
    tick_seconds:
      c.tick_seconds !== undefined && c.tick_seconds >= 1 ? c.tick_seconds : DEFAULT_TICK_SECONDS,
    port: c.port !== undefined && c.port >= 0 ? Math.floor(c.port) : DEFAULT_PORT,
    ...(c.token_file !== undefined ? { token_file: c.token_file } : {}),
    ...(c.allow !== undefined ? { allow: c.allow } : {}),
  };
}

/** Token da API (TASK-04): `GINGA_TOKEN` vence `[serve].token_file` (que é
 *  lido e aparado). Nada configurado ou arquivo ilegualável/vazio → sem
 *  token; quem decide o que fazer é o chamador (gate de host / auth). */
export function resolveToken(root: string, cfg: ServeConfig): string | undefined {
  const fromEnv = (process.env.GINGA_TOKEN ?? "").trim();
  if (fromEnv !== "") return fromEnv;
  if (cfg.token_file === undefined) return undefined;
  try {
    const t = readFileSync(resolve(root, cfg.token_file), "utf8").trim();
    if (t !== "") return t;
    console.error(`serve: [serve].token_file vazio: ${cfg.token_file}`);
  } catch (e) {
    console.error(`serve: não consegui ler [serve].token_file ${cfg.token_file}: ${(e as Error).message}`);
  }
  return undefined;
}

/** Config de notificação (TASK-05): `[notify] mention`, `[notify.targets]`
 *  canal = "target" e `[notify.rules] chave = ["canal", …]` (05 §6). */
export type NotifyConfig = {
  mention?: string;
  targets: Record<string, string>;
  rules: Record<string, string[]>;
};

const REF = /^\s*\[([^\]]+)\]\s*$/;
const KV = /^\s*([A-Za-z0-9_-]+)\s*=\s*(.+?)\s*$/;
const QUOTED = /^"(.*)$/;

const unquote = (v: string): string =>
  QUOTED.test(v) ? v.slice(1, v.endsWith('"') ? -1 : undefined) : v;

const channelList = (v: string): string[] => {
  if (v.startsWith("[")) {
    return v
      .slice(1, v.endsWith("]") ? -1 : undefined)
      .split(",")
      .map((s) => unquote(s.trim()))
      .filter((s) => s !== "");
  }
  const s = unquote(v);
  return s === "" ? [] : [s];
};

/** `[notify]` / `[notify.targets]` / `[notify.rules]` do project.toml. */
export function parseNotifyConfig(raw: string): NotifyConfig {
  const cfg: NotifyConfig = { targets: {}, rules: {} };
  let section = "";
  for (const line of raw.split("\n")) {
    const head = line.match(REF);
    if (head) {
      section = head[1].trim();
      continue;
    }
    const kv = line.match(KV);
    if (!kv) continue;
    if (section === "notify" && kv[2].startsWith('"')) cfg.mention = unquote(kv[2]);
    else if (section === "notify.targets" && kv[2].startsWith('"'))
      cfg.targets[kv[1]] = unquote(kv[2]);
    else if (section === "notify.rules") cfg.rules[kv[1]] = channelList(kv[2]);
  }
  return cfg;
}

function readNotifyConfig(root: string): NotifyConfig {
  let raw = "";
  try {
    raw = readFileSync(join(root, ".ginga", "project.toml"), "utf8");
  } catch {
    // sem project.toml: nada a notificar
  }
  return parseNotifyConfig(raw);
}

const spawnHermes = (cmd: string[]) => Bun.spawn(cmd, { stdout: "pipe", stderr: "pipe" });

/** Roteia os eventos novos do state.db (TASK-05); best-effort e sem segredos:
 *  sem `[notify.targets]` no project.toml, nada sai daqui.
 *  Antes de rotear ingere $GINGA_EVENTS (o router lê a tabela `events`); o
 *  db é aberto pelo root ($GINGA_STATE_DB ou <root>/.ginga/state/state.db) e
 *  o fallback discord usa `fetch`.
 * deps: stubs do port para testes (spawn, fetch...). */
export async function routePending(
  root: string,
  deps: { spawn?: any; fetch?: any; out?: any; env?: any; config?: any } = {},
): Promise<number> {
  const notify: NotifyConfig = readNotifyConfig(root);
  if (Object.keys(notify.targets).length === 0) return 0;
  const eventsPath = process.env.GINGA_EVENTS ?? "";
  if (eventsPath !== "") {
    try {
      ingestEvents(eventsPath);
    } catch (e) {
      console.error(`serve: ingest de ${eventsPath} falhou: ${(e as Error).message}`);
    }
  }
  const db = openStateDb(resolveStateDbPath(root));
  try {
    const r = await routeEvents(db, {
      send: (m) => portSend(m, { spawn: deps.spawn ?? spawnHermes, fetch: deps.fetch ?? globalThis.fetch, ...(deps.out ? { out: deps.out } : {}), ...(deps.env !== undefined ? { env: deps.env } : {}), ...(deps.config !== undefined ? { config: deps.config } : {}) }),
      targets: notify.targets,
      mention: notify.mention,
      rules: notify.rules,
    });
    if (r.routed > 0) console.log(`serve: ${r.routed} evento(s) notificado(s)`);
    return r.routed;
  } finally {
    db.close();
  }
}

/** Roda um tick, sem sobrepor outro: em curso coloca o próximo na fila.
 *  Após cada tick, roteia os eventos novos (TASK-05) pelo project.toml. */
export function makeTickRunner(root: string): () => void {
  let running = false;
  let queued = false;
  const once = async () => {
    if (running) {
      queued = true;
      return;
    }
    running = true;
    try {
      await runTick(["--root", root]);
    } catch (e) {
      console.error(`serve: tick falhou: ${(e as Error).message}`);
    }
    try {
      const watchArgs = ["--root", root];
      const ep = process.env.GINGA_EVENTS ?? "";
      if (ep !== "") watchArgs.push("--events", ep);
      runWatch(watchArgs);
    } catch (e) {
      console.error(`serve: watch falhou: ${(e as Error).message}`);
    }
    try {
      await routePending(root);
    } catch (e) {
      console.error(`serve: notificação falhou: ${(e as Error).message}`);
    } finally {
      running = false;
      if (queued) {
        queued = false;
        void once();
      }
    }
  };
  return () => void once();
}

/** Ponto de entrada do worker: `bun src/serve.ts serve […flags]`. */
export async function runServe(args: string[]): Promise<number> {
  let rootArgs: string | undefined;
  let host = DEFAULT_HOST;
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a === "--root") rootArgs = args[++i];
    else if (a.startsWith("--root=")) rootArgs = a.slice("--root=".length);
    else if (a === "--host") host = args[++i] ?? "";
    else if (a.startsWith("--host=")) host = a.slice("--host=".length);
    else {
      console.error(`uso: ginga serve [--root D] [--host 127.0.0.1] (flag desconhecida: ${a})`);
      return 2;
    }
  }
  const base = rootArgs && rootArgs !== "" ? rootArgs : process.cwd();

  const cfg = readServeConfig(base);
  // PLAN-0011 TASK-04: auth = token (GINGA_TOKEN > [serve].token_file) ou
  // allowlist de CIDRs. Sem auth o bind é forçado em 127.0.0.1 e `--host`
  // diferente sai com 2 citando auth; com auth, `--host 0.0.0.0` sobe e a
  // API exige a credencial em todo caminho.
  const token = resolveToken(base, cfg);
  const allow = cfg.allow ?? [];
  const authOn = token !== undefined || allow.length > 0;

  if (host !== DEFAULT_HOST && !authOn) {
    console.error(
      `serve: --host ${host} exige auth (GINGA_TOKEN, [serve].token_file ou [serve].allow); sem auth o bind é forçado em ${DEFAULT_HOST}`,
    );
    return 2;
  }
  if (!authOn) host = DEFAULT_HOST;

  // PLAN-0011 TASK-03: o HTTP do serve É a API do registro — verbos agem sobre
  // o bundle <root>/.ginga e `GET /` continua respondendo como antes (fallback).
  const eventsPath = process.env.GINGA_EVENTS ?? "";
  const api = startApi({
    root: join(base, ".ginga"),
    dbPath: resolveStateDbPath(base),
    hostname: host,
    port: cfg.port,
    eventsPath: eventsPath !== "" ? eventsPath : undefined,
    fallback: (req: Request) => {
      const webDir = join(base, "web");
      const url = new URL(req.url);
      let rel = url.pathname === "/" ? "index.html" : url.pathname.replace(/^\/+/, "");
      if (rel.includes("..")) return new Response("not found", { status: 404 });
      const full = join(webDir, rel);
      if (!existsSync(full)) {
        if (rel === "index.html") return new Response("ginga serve\n", { status: 200 });
        return new Response("not found", { status: 404 });
      }
      const ext = rel.split(".").pop()?.toLowerCase();
      const type = ext === "html" ? "text/html" : ext === "js" ? "text/javascript" : ext === "css" ? "text/css" : "application/octet-stream";
      return new Response(readFileSync(full), { status: 200, headers: { "content-type": type } });
    },
    ...(authOn
      ? { auth: { ...(token !== undefined ? { token } : {}), ...(allow.length > 0 ? { allow } : {}) } }
      : {}),
  });
  console.log(`ginga serve: ${host}:${api.port} (tick a cada ${cfg.tick_seconds}s)`);

  const tickNow = makeTickRunner(base);
  void tickNow(); // catch-up inicial: o que ficou na fila antes de subir
  setInterval(tickNow, cfg.tick_seconds * 1000);

  // Por evento: appends em $GINGA_EVENTS (emitEvent faz O_APPEND linha a linha)
  // acordam o tick; o debounce agrupa uma rajada num tick só.
  if (eventsPath !== "") {
    let debounce: ReturnType<typeof setTimeout> | null = null;
    try {
      const watcher = watch(eventsPath, () => {
        if (debounce) clearTimeout(debounce);
        debounce = setTimeout(() => {
          debounce = null;
          tickNow();
        }, DEBOUNCE_MS);
      });
      watcher.on("error", (e: unknown) =>
        console.error(`serve: fs.watch em ${eventsPath}: ${(e as Error).message}`),
      );
    } catch (e) {
      console.error(`serve: sem watch de eventos em ${eventsPath}: ${(e as Error).message}`);
    }
  }

  // Supervisor de lanes (PLAN-0023 TASK-03): opcional, configurado por
  // [supervisor] no project.toml ou GINGA_SUPERVISOR_LANES. Roda em
  // segundo plano; não bloqueia o serve.
  let rawProject = "";
  try { rawProject = readFileSync(join(base, ".ginga", "project.toml"), "utf8"); } catch {}
  const supCfg = parseSupervisorConfig(rawProject);
  const cmds = parseCommands(rawProject);
  const envLanes = process.env.GINGA_SUPERVISOR_LANES;
  if (envLanes) {
    for (const part of envLanes.split(";")) {
      const p = part.trim();
      if (!p) continue;
      const eq = p.indexOf("=");
      if (eq > 0) supCfg.lanes.push({ repo: p.slice(0, eq).trim(), command: p.slice(eq + 1).trim() });
    }
  }
  if (supCfg.lanes.length > 0) {
    const sup = new Supervisor(supCfg.lanes, {
      root: base,
      mode: supCfg.mode,
      backoffBaseMs: supCfg.backoffBaseMs,
      backoffMaxMs: supCfg.backoffMaxMs,
      maxRestarts: supCfg.maxRestarts,
      idleCooldownMs: supCfg.idleCooldownMs,
      restartCooldownMs: supCfg.restartCooldownMs,
      queueCommand: (cmds as any).queue,
    });
    void sup.run();
  }

  // O CLI (fachada sync) pode morrer antes do worker: novo pai ⇒ órfão ⇒ sai.
  const parentPid = process.ppid;
  const watchdog = setInterval(() => {
    if (process.ppid !== parentPid) process.exit(0);
  }, WATCHDOG_MS);

  process.on("SIGTERM", () => process.exit(0));
  process.on("SIGINT", () => process.exit(0));

  // roda para sempre; kill/SIGTERM derruba pelo handler acima
  for (;;) await Bun.sleep(60_000);
}

if (import.meta.main) {
  process.exit(await runServe(process.argv.slice(2)));
}
