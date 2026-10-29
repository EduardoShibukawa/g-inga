// Verbos de operação (PLAN-0015 TASK-03): o equivalente ginga dos subcomandos
// do bin/homelab — ctl, web, tui, hermes, hud, verify, maestro, gira. A raiz
// vem de workspace.ts ($GINGA_WORKSPACE ou `.ginga/` mais próximo) e todo
// binário vem do PATH (workspace.ts `binary()`), nunca de caminho absoluto.
// O que controla processo interativo (menu, layout, agente) só age em CLI com
// tty: pela API ou sem terminal o verbo devolve o porquê em JSON e não bloqueia
// nem assume o terminal do chamador (mesma regra do `init` para stdin).

import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { binary, findWorkspace } from "../workspace.ts";
import type { VerbArg, VerbArgs, VerbCtx } from "./registry.ts";

/** Posicionais que a CLI congelada de `src/cli.ts` consegue encaminhar a um
 *  verbo de passthrough: ela preenche `verb.args` em ordem e recusa o que
 *  exceder, então o registro declara N slots e o verbo os remonta em argv. */
export const OPS_SLOTS = 8;

/** Args de passthrough (`arg1..argN`); `required` exige ao menos um posicional
 *  — erro 2 na CLI, 400 na API — o que evita spawn acidental do verbo nu. */
export function passthrough(required = false): VerbArg[] {
  return Array.from({ length: OPS_SLOTS }, (_, i) =>
    required && i === 0 ? { name: `arg${i + 1}`, required: true } : { name: `arg${i + 1}` },
  );
}

/** argv na ordem de declaração: só os slots preenchidos, vazios fora. */
function rest(args: VerbArgs): string[] {
  const out: string[] = [];
  for (let i = 1; i <= OPS_SLOTS; i++) {
    const v = args[`arg${i}`];
    if (v !== undefined && v !== "") out.push(v);
  }
  return out;
}

function need(name: string): string {
  const bin = binary(name);
  if (!bin) throw new Error(`${name} não está no PATH`);
  return bin;
}

/** exec síncrono com stdios herdados: a saída do tool é a saída do ginga. */
function runTool(bin: string, argv: string[], cwd?: string): number {
  const child = Bun.spawnSync([bin, ...argv], {
    stdout: "inherit",
    stderr: "inherit",
    stdin: "inherit",
    ...(cwd !== undefined ? { cwd } : {}),
  });
  if (child.error) throw new Error(`${bin}: ${child.error.message}`);
  if (child.exitCode === null) throw new Error(`${bin} não finalizou`);
  return child.exitCode;
}

/** Roda o binário do PATH com `argv` na ordem e propaga o resultado. */
function delegate(label: string, argv: string[]): unknown {
  const exit = runTool(need(label), argv);
  if (exit !== 0) throw new Error(`${label} ${argv.join(" ")} saiu com ${exit}`);
  return { exec: label, args: argv, exit };
}

/** Raiz do workspace: o que `findWorkspace` achar; senão o pai do bundle
 *  (`--root <ws>/.ginga` aponta para o bundle, o workspace é o pai). */
function workspaceDir(ctx: VerbCtx): string {
  try {
    return findWorkspace(process.cwd());
  } catch {
    return dirname(ctx.root);
  }
}

/** Motivo de inação quando não é CLI com tty (menu/layout/agente interativo);
 *  null quando o verbo pode de fato controlar o terminal do chamador. */
function interactive(ctx: VerbCtx, name: string): { exec: string; skipped: string } | null {
  if (ctx.via !== "cli") return { exec: name, skipped: `via ${ctx.via}: ${name} controla o terminal — use a CLI` };
  if (!process.stdin.isTTY || !process.stdout.isTTY) return { exec: name, skipped: `sem tty: ${name} precisa de terminal` };
  return null;
}

// ---------------------------------------------------------------------------
// Delegação ao PATH (verify/maestro → pinga; gira → passthrough)
// ---------------------------------------------------------------------------

export function verify(ctx: VerbCtx, args: VerbArgs): unknown {
  void ctx;
  return delegate("pinga", ["verify", ...rest(args)]);
}

export function maestro(ctx: VerbCtx, args: VerbArgs): unknown {
  void ctx;
  return delegate("pinga", ["maestro", ...rest(args)]);
}

export function gira(ctx: VerbCtx, args: VerbArgs): unknown {
  void ctx;
  return delegate("gira", rest(args));
}

export function hermes(ctx: VerbCtx, args: VerbArgs): unknown {
  const idle = interactive(ctx, "hermes");
  if (idle) return idle;
  const argv = rest(args);
  return delegate("hermes", argv);
}

// ---------------------------------------------------------------------------
// HUD: alerta flutuante da sessão TUIOS (equivalente ao `homelab hud`)
// ---------------------------------------------------------------------------

export function hud(ctx: VerbCtx, args: VerbArgs): unknown {
  const tokens = rest(args);
  const kind = tokens[0] ?? "working";
  const msg = tokens.slice(1).join(" ") || "Notificação ginga";
  if (ctx.via !== "cli") return { exec: "tuios", skipped: `via ${ctx.via}: hud anuncia o terminal desta sessão` };
  const exit = runTool(need("tuios"), ["status", kind, ...(kind === "blocked" ? ["--kind", "permission"] : []), "--app", "ginga", "--msg", msg]);
  if (exit !== 0) throw new Error(`hud: tuios status saiu com ${exit}`);
  return { sent: true, kind, msg };
}

// ---------------------------------------------------------------------------
// Web dashboard: `ginga serve` como daemon (a porta 4242 é do painel do
// pinga; a API/serve do ginga é a 4243 — src/serve.ts).
// ---------------------------------------------------------------------------

const WEB_PORT_DEFAULT = 4243;

function pidFile(): string {
  return process.env.GINGA_WEB_PID ?? join(tmpdir(), "ginga-web.pid");
}

function webPid(): number | null {
  let raw = "";
  try {
    raw = readFileSync(pidFile(), "utf8");
  } catch {
    return null;
  }
  const pid = Number(raw.trim());
  if (!Number.isInteger(pid) || pid <= 0) return null;
  try {
    process.kill(pid, 0);
    return pid;
  } catch {
    return null;
  }
}

function webUrl(): string {
  const port = Number(process.env.GINGA_WEB_PORT ?? "") || WEB_PORT_DEFAULT;
  return `http://127.0.0.1:${port}`;
}

function webStart(ctx: VerbCtx): unknown {
  const ws = workspaceDir(ctx);
  const running = webPid();
  if (running !== null) return { action: "start", already: true, pid: running };
  const child = Bun.spawn([process.execPath, join(import.meta.dir, "..", "serve.ts"), "--root", ws], {
    cwd: ws,
    detached: true,
    stdin: "ignore",
    stdout: "ignore",
    stderr: "ignore",
  });
  child.unref();
  if (child.pid === undefined) throw new Error("falha ao iniciar o serve");
  writeFileSync(pidFile(), `${child.pid}\n`);
  return { action: "start", pid: child.pid, root: ws };
}

function webStop(): unknown {
  const pid = webPid();
  if (pid === null) return { action: "stop", running: false };
  try {
    process.kill(pid, "SIGTERM");
  } catch {
    // morreu entre o probe e o kill: o objetivo (parado) já está alcançado
  }
  rmSync(pidFile(), { force: true });
  return { action: "stop", running: true, pid, stopped: true };
}

export function web(ctx: VerbCtx, args: VerbArgs): unknown {
  const action = (args.action ?? "").trim() || "status";
  switch (action) {
    case "start":
      return webStart(ctx);
    case "stop":
      return webStop();
    case "restart": {
      webStop();
      return webStart(ctx);
    }
    case "open": {
      if (webPid() === null) webStart(ctx);
      const opener = binary("xdg-open");
      if (opener) runTool(opener, [webUrl()]);
      return { action: "open", url: webUrl(), opener };
    }
    case "status": {
      const pid = webPid();
      return { action: "status", running: pid !== null, ...(pid !== null ? { pid } : {}), url: webUrl() };
    }
    default:
      throw new Error(`ação web inválida: ${action} (use start|stop|restart|open|status)`);
  }
}

// ---------------------------------------------------------------------------
// Central de controle: menu gum/fzf sobre os verbos de operação, se houver;
// sem menu o retorno é a própria lista (a superfície não depende de TTY).
// ---------------------------------------------------------------------------

const MENU = ["status", "web start", "web stop", "web open", "web status", "tui", "hermes", "hud", "verify", "maestro", "gira"];

export function ctl(ctx: VerbCtx, args: VerbArgs): unknown {
  const extra = rest(args);
  const idle = interactive(ctx, "ctl");
  if (idle) return { ...idle, items: MENU };
  if ((args.popup ?? "") !== "") {
    const tuios = binary("tuios");
    if (tuios) {
      const sess = process.env.TUIOS_SESSION ?? basename(workspaceDir(ctx));
      const inner = [process.execPath, join(import.meta.dir, "..", "..", "bin", "ginga.ts"), "ctl", ...extra, "--root", ctx.root];
      const exit = runTool(tuios, ["popup", "-s", sess, "--width", "85%", "--height", "75%", "--", ...inner]);
      return { exec: "tuios popup", session: sess, exit };
    }
  }
  const gum = binary("gum");
  const fzf = binary("fzf");
  if (!gum && !fzf) return { exec: "ctl", menu: false, items: MENU, hint: "sem gum/fzf no PATH: rode `ginga <verbo>` direto" };
  const chosen = gum
    ? Bun.spawnSync([gum, "choose", ...MENU], { stdout: "pipe", stderr: "inherit", stdin: "inherit" })
    : Bun.spawnSync([fzf!, "--reverse", "--height", "40%", "--prompt", "ginga> "], { input: MENU.join("\n"), stdout: "pipe", stderr: "inherit" });
  if (chosen.error) throw new Error(`menu: ${(chosen.error as Error).message}`);
  const selected = chosen.stdout.toString().trim();
  if (selected === "") return { exec: "ctl", selected: null };
  const argv = [...selected.split(/\s+/), ...extra, "--root", ctx.root];
  const exit = runTool(process.execPath, [join(import.meta.dir, "..", "..", "bin", "ginga.ts"), ...argv]);
  if (exit !== 0) throw new Error(`ctl: ginga ${argv.join(" ")} saiu com ${exit}`);
  return { exec: "ctl", selected, exit };
}

// ---------------------------------------------------------------------------
// TUI: layout da sessão no TUIOS — attach se existe, create+attach se não.
// ---------------------------------------------------------------------------

export function tui(ctx: VerbCtx, args: VerbArgs): unknown {
  const idle = interactive(ctx, "tui");
  if (idle) return idle;
  const tuios = need("tuios");
  const ws = workspaceDir(ctx);
  const sess = (args.session ?? "").trim() || process.env.TUIOS_SESSION || basename(ws);
  const probe = Bun.spawnSync([tuios, "has-session", "-s", sess], { stdout: "ignore", stderr: "ignore" });
  const existed = probe.exitCode === 0;
  if (!existed) {
    const created = runTool(tuios, ["new-session", "-d", "-s", sess], ws);
    if (created !== 0) throw new Error(`tuios: new-session ${sess} saiu com ${created}`);
  }
  const attach = runTool(tuios, ["attach", sess]);
  if (attach !== 0) throw new Error(`tuios: attach ${sess} saiu com ${attach}`);
  return { exec: "tuios", session: sess, workspace: ws, created: !existed };
}
