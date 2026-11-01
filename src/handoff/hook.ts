// Hook de handoff automático (doc 11 §3): lê o JSON do runtime no stdin,
// roda decideHandoff, grava o handoff em prepare/redirect e responde no
// formato do Claude (`decision: block`) e do Codex.
import { existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { parseHandoffCfg, decideHandoff, type HandoffCfg, type HandoffState } from "./policy.ts";
import { transcriptUsage } from "./transcript_usage.ts";
import { openSession } from "./open.ts";
import { buildHandoff } from "../handoff.ts";

export type HookDeps = {
  now: Date;
  root?: string;
  open?: (
    handoffPath: string,
    opts: { userPrompt: string; model: string },
  ) => Promise<{ sessionRef: string | null; attachCmd?: string }>;
};

export type HookOutput = { decision?: "block"; reason?: string };

/** Mini-parse de TOML → { section: { key: value } } (valores numéricos convertidos). */
function parseSimpleToml(raw: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  let section = "";
  for (let rawLine of raw.split(/\r?\n/)) {
    const hash = rawLine.indexOf("#");
    let line = hash < 0 ? rawLine : rawLine.slice(0, hash);
    line = line.trim();
    if (line === "") continue;
    const sec = /^\[([^\]]+)\]$/.exec(line);
    if (sec) {
      section = sec[1]!.trim();
      continue;
    }
    const kv = /^([^=]+)=(.*)$/.exec(line);
    if (!kv) continue;
    const key = kv[1]!.trim();
    let val: string = kv[2]!.trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    let parsedVal: unknown = val;
    if (/^-?\d+$/.test(val)) parsedVal = parseInt(val, 10);
    if (!section) {
      (result as any)[key] = parsedVal;
    } else {
      const secObj = (result[section] as Record<string, unknown>) || {};
      secObj[key] = parsedVal;
      result[section] = secObj;
    }
  }
  return result;
}

/** Resolve o diretório `.ginga` subindo a partir do cwd informado no hook. */
export function resolveBundleRoot(cwd: string): string {
  const start = resolve(cwd);
  let current = start;
  while (true) {
    const candidate = join(current, ".ginga");
    if (existsSync(candidate)) return candidate;
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return join(start, ".ginga");
}

function parseConfig(root: string, runtime: string): HandoffCfg {
  const tomlPath = join(root, "project.toml");
  if (!existsSync(tomlPath)) return parseHandoffCfg({}, runtime);
  const raw = readFileSync(tomlPath, "utf8");
  return parseHandoffCfg(parseSimpleToml(raw), runtime);
}

function gitSafe(args: string[], cwd: string): string {
  try {
    const proc = Bun.spawnSync(["git", ...args], { cwd, stdout: "pipe", stderr: "ignore" });
    if (proc.exitCode !== 0) return "";
    return new TextDecoder().decode(proc.stdout || new Uint8Array());
  } catch {
    return "";
  }
}

function spawnRuntime(cmd: string[], args: string[], opts: { cwd: string }): { stdout: string; exitCode: number } {
  try {
    const proc = Bun.spawnSync([...cmd, ...args], {
      cwd: opts.cwd,
      stdin: "ignore",
      stdout: "pipe",
      stderr: "ignore",
    });
    return {
      stdout: new TextDecoder().decode(proc.stdout),
      exitCode: proc.exitCode ?? 1,
    };
  } catch {
    return { stdout: "", exitCode: 1 };
  }
}

function loadState(root: string, sessionId: string): any {
  const p = join(root, "state", `handoff-${sessionId}.json`);
  if (!existsSync(p)) return {};
  try {
    return JSON.parse(readFileSync(p, "utf8"));
  } catch {
    return {};
  }
}

function saveState(root: string, sessionId: string, state: any): void {
  const dir = join(root, "state");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `handoff-${sessionId}.json`), JSON.stringify(state, null, 2), "utf8");
}

/**
 * Grava sempre no path canônico devolvido por buildHandoff. A API direta
 * antiga (sem deps.root) mantém `<cwd>/handoffs` como alias do diretório
 * `.ginga/handoffs` quando o cwd já é o diretório pai do bundle.
 */
function writeHandoff(path: string, markdown: string, legacyAlias?: string): void {
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(path, markdown, "utf8");
  if (legacyAlias && !existsSync(legacyAlias)) {
    try {
      symlinkSync(dir, legacyAlias, "dir");
    } catch {
      // O alias legado não pode impedir a gravação canônica.
    }
  }
}

/** Hook entrada: runtime, stdin JSON (do Claude/Codex), deps injetáveis. */
export async function runHook(runtime: string, stdin: string, deps: HookDeps): Promise<HookOutput> {
  let input: any;
  try {
    input = JSON.parse(stdin);
  } catch {
    return {};
  }

  const { session_id, transcript_path, cwd, prompt, hook_event_name } = input;
  if (!cwd) return {};

  // mapear evento
  let event: "prompt" | "turn_end";
  if (hook_event_name === "UserPromptSubmit") event = "prompt";
  else if (hook_event_name === "Stop") event = "turn_end";
  else return {};

  // prefixo !! ignora gatilho
  if (event === "prompt" && typeof prompt === "string" && prompt.startsWith("!!")) {
    return {};
  }

  // sessão não interativa (sem transcript_path) → none
  if (!transcript_path) return {};

  const hasExplicitRoot = deps.root !== undefined;
  const root = deps.root && existsSync(deps.root)
    ? resolve(deps.root)
    : resolveBundleRoot(cwd);
  const legacyAlias = !hasExplicitRoot && existsSync(join(resolve(cwd), ".ginga"))
    ? join(resolve(cwd), "handoffs")
    : undefined;
  const cfg = parseConfig(root, runtime);
  const usage = transcriptUsage(transcript_path);
  const state = loadState(root, session_id);

  // 1 redirect por sessão
  if (state.redirected) return {};

  const now = deps.now ?? new Date();
  const lastApiTs = usage.lastApiTs ?? now;
  const s: HandoffState = {
    now,
    lastApiTs,
    contextTokens: usage.contextTokens,
    interactive: true,
    depth: state.depth ?? 0,
    lastHandoffTs: state.lastHandoffTs ? new Date(state.lastHandoffTs) : null,
    event,
  };

  const decision = decideHandoff(cfg, s);

  if (decision.action === "none") return {};

  if (decision.action === "prepare") {
    // grava o handoff e sai sem bloquear
    const { markdown, path } = buildHandoff(root, {
      now,
      git: gitSafe,
      trigger: decision.trigger ?? "context",
      runtime,
      from_session: session_id,
      depth: state.depth ?? 0,
    });
    writeHandoff(path, markdown, legacyAlias);
    saveState(root, session_id, {
      ...state,
      lastHandoffTs: now.toISOString(),
      depth: state.depth ?? 0,
      handoffPath: path,
    });
    return {};
  }

  if (decision.action === "redirect") {
    // grava o handoff e abre sessão nova
    const { markdown, path } = buildHandoff(root, {
      now,
      git: gitSafe,
      trigger: decision.trigger ?? "idle",
      runtime,
      from_session: session_id,
      depth: state.depth ?? 0,
    });
    writeHandoff(path, markdown, legacyAlias);

    const open = deps.open ?? (async (handoffPath: string, opts: { userPrompt: string; model: string }) => {
      const opened = await openSession(runtime, {
        handoffPath,
        userPrompt: opts.userPrompt,
        model: opts.model,
        cwd,
        spawn: spawnRuntime,
        now,
      });
      return { sessionRef: opened.sessionRef, attachCmd: opened.attachCmd };
    });
    const model = (cfg.model ?? process.env.GINGA_MODEL ?? "sonnet").trim() || "sonnet";
    const opened = await open(path, { userPrompt: prompt ?? "", model });
    const sessionRef = opened.sessionRef;
    const ref = sessionRef ?? path;
    const attachCmd = opened.attachCmd ?? `claude attach ${ref}`;

    // persiste estado: 1 redirect por sessão
    saveState(root, session_id, {
      redirected: true,
      lastHandoffTs: now.toISOString(),
      depth: (state.depth ?? 0) + 1,
      handoffPath: path,
    });

    return { decision: "block", reason: `sessão nova ${ref}: ${attachCmd}` };
  }

  return {};
}
