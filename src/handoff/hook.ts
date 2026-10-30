// Hook de handoff automático (doc 11 §3): lê o JSON do runtime no stdin,
// roda decideHandoff, grava o handoff em prepare/redirect e responde no
// formato do Claude (`decision: block`) e do Codex.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseHandoffCfg, decideHandoff, type HandoffCfg, type HandoffState } from "./policy.ts";
import { transcriptUsage } from "./transcript_usage.ts";
import { buildHandoff } from "../handoff.ts";

export type HookDeps = {
  now: Date;
  open?: (handoffPath: string, opts: { userPrompt: string; model: string }) => Promise<{ sessionRef: string | null }>;
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

function parseConfig(cwd: string, runtime: string): HandoffCfg {
  const tomlPath = join(cwd, ".ginga", "project.toml");
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

function loadState(cwd: string, sessionId: string): any {
  const p = join(cwd, ".ginga", "state", `handoff-${sessionId}.json`);
  if (!existsSync(p)) return {};
  try {
    return JSON.parse(readFileSync(p, "utf8"));
  } catch {
    return {};
  }
}

function saveState(cwd: string, sessionId: string, state: any): void {
  const dir = join(cwd, ".ginga", "state");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `handoff-${sessionId}.json`), JSON.stringify(state, null, 2), "utf8");
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

  const cfg = parseConfig(cwd, runtime);
  const usage = transcriptUsage(transcript_path);
  const state = loadState(cwd, session_id);

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
    const { markdown, path } = buildHandoff(cwd, {
      now,
      git: gitSafe,
      trigger: decision.trigger ?? "context",
      runtime,
      from_session: session_id,
      depth: state.depth ?? 0,
    });
    const dir = join(cwd, "handoffs");
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(path, markdown, "utf8");
    return {};
  }

  if (decision.action === "redirect") {
    // grava o handoff e abre sessão nova
    const { markdown, path } = buildHandoff(cwd, {
      now,
      git: gitSafe,
      trigger: decision.trigger ?? "idle",
      runtime,
      from_session: session_id,
      depth: state.depth ?? 0,
    });
    const dir = join(cwd, "handoffs");
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(path, markdown, "utf8");

    let sessionRef: string | null = null;
    if (deps.open) {
      const result = await deps.open(path, { userPrompt: prompt ?? "", model: "" });
      sessionRef = result.sessionRef;
    }
    const ref = sessionRef ?? path;

    // persiste estado: 1 redirect por sessão
    saveState(cwd, session_id, {
      redirected: true,
      lastHandoffTs: now.toISOString(),
      depth: (state.depth ?? 0) + 1,
      handoffPath: path,
    });

    return { decision: "block", reason: `sessão nova ${ref}: claude attach ${ref}` };
  }

  return {};
}
