import { spawn } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type CMTask, verify } from "./tasks";

export type Mode = "M" | "C" | "X1" | "X2" | "O";

export type Trial = {
  task: string;
  mode: Mode;
  model: string;
  k: number;
  reward: 0 | 1;
  turns: number;
  tokens_in: number;
  tokens_out: number;
  cost_usd: number;
  latency_ms: number;
  infra: boolean;
  session_id?: string;
};

export type Spawn = (
  argv: string[],
  o: { cwd: string; stdin: "ignore" },
) => Promise<{ code: number; stdout: string; stderr: string }>;

export type ExportMetrics = {
  in: number;
  out: number;
  cache: number;
  cost: number;
  turns: number;
  reasoning: number;
};

/** Spawn real; o runner de testes sempre injeta seu próprio Spawn. */
export const processSpawn: Spawn = (argv, options) =>
  new Promise((resolve, reject) => {
    const child = spawn(argv[0] ?? "", argv.slice(1), {
      cwd: options.cwd,
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.once("error", reject);
    child.once("close", (code) => {
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });

/** O diretório de trabalho é fornecido ao spawn; o argv não o duplica. */
export function trialArgv(
  _mode: Mode,
  model: string,
  _workdir: string,
  prompt: string,
): string[] {
  return [
    "opencode",
    "run",
    "--standalone",
    "--format",
    "json",
    "-m",
    model,
    prompt,
  ];
}

function metric(value: unknown, name: string): number {
  const number = typeof value === "number" ? value : Number(value ?? 0);
  if (!Number.isFinite(number)) throw new Error(`métrica inválida: ${name}`);
  return number;
}

/** Lê o agregado e as mensagens do `opencode session export --standalone`. */
export function parseExport(json: string): ExportMetrics {
  const root = JSON.parse(json) as {
    info?: {
      cost?: unknown;
      tokens?: {
        input?: unknown;
        output?: unknown;
        reasoning?: unknown;
        cache?: { read?: unknown } | null;
      };
    };
    messages?: Array<{ type?: unknown }>;
  };
  if (!root.info || typeof root.info !== "object") {
    throw new Error("export sem info");
  }

  const tokens = root.info.tokens ?? {};
  const messages = Array.isArray(root.messages) ? root.messages : [];
  return {
    in: metric(tokens.input, "tokens.input"),
    out: metric(tokens.output, "tokens.output"),
    cache: metric(tokens.cache?.read, "tokens.cache.read"),
    cost: metric(root.info.cost, "info.cost"),
    turns: messages.filter((message) => message.type === "assistant").length,
    reasoning: metric(tokens.reasoning, "tokens.reasoning"),
  };
}

type JsonCandidate = { start: number; value: unknown };

function parsed(text: string): unknown | undefined {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function balancedEnd(text: string, start: number): number {
  const stack: string[] = [];
  let quoted = false;
  let escaped = false;

  for (let index = start + 1; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') quoted = false;
      continue;
    }
    if (char === '"') {
      quoted = true;
      continue;
    }
    if (char === "{" || char === "[") stack.push(char === "{" ? "}" : "]");
    else if (char === "}" || char === "]") {
      if (stack.pop() !== char) return -1;
      if (stack.length === 0) return index;
    }
  }
  return -1;
}

function stringEnd(text: string, start: number): number {
  let escaped = false;
  for (let index = start + 1; index < text.length; index += 1) {
    const char = text[index];
    if (escaped) escaped = false;
    else if (char === "\\") escaped = true;
    else if (char === '"') return index;
  }
  return -1;
}

/** Extrai o último valor JSON válido do texto (inclusive de um bloco cercado). */
function lastJson(text: string): unknown {
  const trimmed = text.trim();
  const whole = parsed(trimmed);
  if (whole !== undefined) return whole;

  const candidates: JsonCandidate[] = [];
  const fences = /```(?:json)?\s*([\s\S]*?)```/gi;
  for (const match of trimmed.matchAll(fences)) {
    const value = parsed(match[1].trim());
    if (value !== undefined) {
      candidates.push({ start: match.index ?? 0, value });
    }
  }

  for (let index = 0; index < trimmed.length; index += 1) {
    const char = trimmed[index];
    if (char !== "{" && char !== "[" && char !== '"') continue;
    const end = char === '"' ? stringEnd(trimmed, index) : balancedEnd(trimmed, index);
    if (end < 0) continue;
    const value = parsed(trimmed.slice(index, end + 1));
    if (value !== undefined) {
      candidates.push({ start: index, value });
      index = end;
    }
  }

  candidates.sort((left, right) => right.start - left.start);
  return candidates[0]?.value;
}

function answerFromRun(stdout: string): unknown {
  const texts: string[] = [];
  for (const line of stdout.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const event = parsed(line);
    if (!event || typeof event !== "object") {
      texts.push(line);
      continue;
    }
    const record = event as {
      type?: unknown;
      text?: unknown;
      content?: unknown;
      part?: { text?: unknown } | null;
    };
    if (typeof record.part?.text === "string") texts.push(record.part.text);
    else if (record.type === "text" && typeof record.text === "string") texts.push(record.text);
    else if (record.type === "assistant" && typeof record.content === "string") {
      texts.push(record.content);
    }
  }
  if (texts.length === 0 && stdout.trim()) texts.push(stdout);

  let answer: unknown;
  for (const text of texts) {
    const candidate = lastJson(text);
    if (candidate !== undefined) answer = candidate;
  }
  return answer;
}

function sessionId(stdout: string): string {
  const first = stdout.split(/\r?\n/).find((line) => line.trim())?.trim();
  const event = first ? (parsed(first) as { sessionID?: unknown } | undefined) : undefined;
  if (!event || typeof event.sessionID !== "string" || !event.sessionID) {
    throw new Error("run sem sessionID na primeira linha");
  }
  return event.sessionID;
}

function infraFailure(code: number, output: string): boolean {
  if (code === 429 || (code >= 500 && code <= 599)) return true;
  return /\b429\b|\b5\d{2}\b|too many requests|rate.?limit|timed?.?out|timeout|deadline exceeded/i.test(
    output,
  );
}

function copySnapshot(snapshot: string, workdir: string): void {
  if (!existsSync(snapshot)) throw new Error(`snapshot não existe: ${snapshot}`);
  for (const entry of readdirSync(snapshot)) {
    cpSync(join(snapshot, entry), join(workdir, entry), { recursive: true });
  }
}

async function writeModeConfig(mode: Mode, snapshot: string, workdir: string): Promise<void> {
  let config: Record<string, unknown>;
  const configModule = join(import.meta.dir, "config.ts");
  if (existsSync(configModule)) {
    const moduleName = "./config";
    const loaded = (await import(moduleName)) as {
      agentConfig?: (mode: Mode, o: { snapshot: string; repoDir: string }) => object;
    };
    if (!loaded.agentConfig) throw new Error("config.ts sem agentConfig");
    config = loaded.agentConfig(mode, { snapshot, repoDir: workdir }) as Record<string, unknown>;
  } else {
    config = {
      $schema: "https://opencode.ai/config.json",
      tools: { bash: mode === "C", edit: false, write: false },
      permission: {
        bash: mode === "C" ? "allow" : "deny",
        edit: "deny",
        webfetch: "deny",
      },
      instructions: [".code-mode/instructions.md"],
    };
  }

  mkdirSync(join(workdir, ".code-mode"), { recursive: true });
  writeFileSync(
    join(workdir, ".code-mode", "instructions.md"),
    `# Modo ${mode}\n\nUse somente os dados do snapshot copiado para este diretório. Responda com JSON.\n`,
  );
  writeFileSync(join(workdir, "opencode.json"), `${JSON.stringify(config, null, 2)}\n`);
}

function promptFor(task: CMTask): string {
  return [
    "Responda somente com um valor JSON válido, sem markdown e sem texto adicional.",
    task.question,
    `O JSON deve respeitar este schema: ${JSON.stringify(task.answer_schema)}`,
    "Os dados do snapshot estão na raiz do diretório de trabalho atual.",
  ].join("\n");
}

/** Executa um trial isolado e mede o consumo pelo export da sessão. */
export async function runTrial(o: {
  task: CMTask;
  mode: Mode;
  model: string;
  k: number;
  snapshot: string;
  spawn: Spawn;
}): Promise<Trial> {
  const started = Date.now();
  const workdir = mkdtempSync(join(tmpdir(), "code-mode-trial-"));
  const trial: Trial = {
    task: o.task.id,
    mode: o.mode,
    model: o.model,
    k: o.k,
    reward: 0,
    turns: 0,
    tokens_in: 0,
    tokens_out: 0,
    cost_usd: 0,
    latency_ms: 0,
    infra: false,
  };

  try {
    copySnapshot(o.snapshot, workdir);
    await writeModeConfig(o.mode, workdir, workdir);

    let run: Awaited<ReturnType<Spawn>>;
    try {
      run = await o.spawn(trialArgv(o.mode, o.model, workdir, promptFor(o.task)), {
        cwd: workdir,
        stdin: "ignore",
      });
    } catch (error) {
      trial.infra = true;
      trial.latency_ms = Date.now() - started;
      return trial;
    }

    if (run.code !== 0) {
      trial.infra = infraFailure(run.code, `${run.stderr}\n${run.stdout}`);
      trial.latency_ms = Date.now() - started;
      return trial;
    }

    let id: string;
    try {
      id = sessionId(run.stdout);
    } catch {
      trial.infra = true;
      trial.latency_ms = Date.now() - started;
      return trial;
    }
    trial.session_id = id;

    let exported: Awaited<ReturnType<Spawn>>;
    try {
      exported = await o.spawn(["opencode", "session", "export", "--standalone", id], {
        cwd: workdir,
        stdin: "ignore",
      });
    } catch {
      trial.infra = true;
      trial.latency_ms = Date.now() - started;
      return trial;
    }
    if (exported.code !== 0) {
      trial.infra = infraFailure(exported.code, `${exported.stderr}\n${exported.stdout}`) || true;
      trial.latency_ms = Date.now() - started;
      return trial;
    }

    let metrics: ExportMetrics;
    try {
      metrics = parseExport(exported.stdout);
    } catch {
      trial.infra = true;
      trial.latency_ms = Date.now() - started;
      return trial;
    }

    trial.tokens_in = metrics.in;
    trial.tokens_out = metrics.out;
    trial.cost_usd = metrics.cost;
    trial.turns = metrics.turns;
    trial.reward = verify(o.task, answerFromRun(run.stdout), o.snapshot);
    trial.latency_ms = Date.now() - started;
    return trial;
  } finally {
    rmSync(workdir, { recursive: true, force: true });
  }
}
