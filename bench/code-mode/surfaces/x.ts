import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export type ToolSignature = { name: string; signature: string };

const TOOL_SIGNATURES: ToolSignature[] = [
  { name: "list_plans", signature: "list_plans(snapshot: string): string[]" },
  { name: "read_plan", signature: "read_plan(snapshot: string, plan: string): string | null" },
  { name: "list_tasks", signature: "list_tasks(snapshot: string, plan: string): string[]" },
  { name: "read_task", signature: "read_task(snapshot: string, plan: string, task: string): string | null" },
  { name: "read_log", signature: "read_log(snapshot: string, plan: string): string" },
  { name: "grep_logs", signature: "grep_logs(snapshot: string, plan: string, pattern: string): string[]" },
  { name: "list_runs", signature: "list_runs(snapshot: string): string[]" },
  { name: "read_run", signature: "read_run(snapshot: string, file: string): string | null" },
  { name: "count_in_runs", signature: "count_in_runs(snapshot: string, pattern: string): number" },
  { name: "plan_deps", signature: "plan_deps(snapshot: string, plan: string): string[]" },
  { name: "task_attempts", signature: "task_attempts(snapshot: string, plan: string, task: string): { attempts: number; pass: number }" },
  { name: "paid_attempts", signature: "paid_attempts(snapshot: string, plan: string): Array<{ task: string; model: string; attempt: number; cost: number }>" },
];

/** Lista as assinaturas de leitura disponíveis para scripts do modo X. */
export function search_tools(query: string): ToolSignature[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return TOOL_SIGNATURES.map((tool) => ({ ...tool }));
  return TOOL_SIGNATURES
    .filter((tool) => `${tool.name} ${tool.signature}`.toLowerCase().includes(needle))
    .map((tool) => ({ ...tool }));
}

export function bwrapArgv(snapshot: string, script: string, minimal: boolean): string[] {
  const base = ["bwrap", "--unshare-net", "--dev", "/dev", "--proc", "/proc", "--tmpfs", "/tmp"];
  const parts: string[] = [...base];

  if (minimal) {
    parts.push("--ro-bind", "/usr", "/usr");
  } else {
    parts.push("--ro-bind", "/", "/");
  }

  parts.push("--ro-bind", snapshot, snapshot);
  parts.push("--ro-bind", script, script);
  parts.push("--", "bun", script);

  return parts;
}

export function truncate(out: string, max = 8000): string {
  if (out.length > max) {
    return out.slice(0, max) + " [truncated]";
  }
  return out;
}

export async function execute(
  script: string,
  o: { snapshot: string; minimal: boolean; run: (argv: string[]) => Promise<string> }
): Promise<string> {
  const dir = mkdtempSync(join(tmpdir(), "ginga-code-mode-"));
  const scriptPath = join(dir, "script.ts");
  writeFileSync(scriptPath, script, "utf8");
  try {
    const argv = bwrapArgv(o.snapshot, scriptPath, o.minimal);
    const output = await o.run(argv);
    return truncate(output);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function runBwrap(argv: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(argv[0]!, argv.slice(1), { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(stderr.trim() || `bwrap saiu com ${code ?? "sinal"}`));
    });
  });
}

type JsonRpcRequest = {
  jsonrpc: "2.0";
  id: number | string | null;
  method: string;
  params?: any;
};

function xSnapshotFromArgv(): string {
  const index = process.argv.indexOf("--snapshot");
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  return value && !value.startsWith("--") ? value : process.cwd();
}

async function handleXRequest(request: JsonRpcRequest): Promise<unknown> {
  if (request.method === "initialize") {
    return {
      jsonrpc: "2.0",
      id: request.id,
      result: {
        protocolVersion: "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "ginga-code-mode-x", version: "0.1.0" },
      },
    };
  }

  if (request.method === "tools/list") {
    return {
      jsonrpc: "2.0",
      id: request.id,
      result: {
        tools: [
          {
            name: "search_tools",
            description: "Lista assinaturas da API de leitura disponível ao script",
            inputSchema: {
              type: "object",
              properties: { query: { type: "string" } },
            },
          },
          {
            name: "execute",
            description: "Executa um script Bun dentro do bwrap e devolve a saída truncada",
            inputSchema: {
              type: "object",
              properties: {
                script: { type: "string" },
                minimal: { type: "boolean" },
              },
              required: ["script"],
            },
          },
        ],
      },
    };
  }

  if (request.method === "tools/call") {
    const name = request.params?.name;
    const args = request.params?.arguments ?? {};
    try {
      if (name === "search_tools") {
        const found = search_tools(String(args.query ?? ""));
        return {
          jsonrpc: "2.0",
          id: request.id,
          result: { content: [{ type: "text", text: JSON.stringify(found) }] },
        };
      }
      if (name === "execute") {
        const output = await execute(String(args.script ?? ""), {
          snapshot: xSnapshotFromArgv(),
          minimal: args.minimal === true,
          run: runBwrap,
        });
        return {
          jsonrpc: "2.0",
          id: request.id,
          result: { content: [{ type: "text", text: output }] },
        };
      }
      return {
        jsonrpc: "2.0",
        id: request.id,
        error: { code: -32601, message: `Unknown tool: ${name}` },
      };
    } catch (error) {
      return {
        jsonrpc: "2.0",
        id: request.id,
        error: { code: -32000, message: error instanceof Error ? error.message : String(error) },
      };
    }
  }

  return {
    jsonrpc: "2.0",
    id: request.id,
    error: { code: -32600, message: `Method not found: ${request.method}` },
  };
}

function serveStdio(): void {
  let buffer = "";
  const consume = async (line: string): Promise<void> => {
    if (!line.trim()) return;
    try {
      const request = JSON.parse(line) as JsonRpcRequest;
      const response = await handleXRequest(request);
      process.stdout.write(`${JSON.stringify(response)}\n`);
    } catch {
      process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } })}\n`);
    }
  };

  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk: string) => {
    buffer += chunk;
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) void consume(line);
  });
  process.stdin.on("end", () => {
    if (buffer.trim()) void consume(buffer);
  });
  process.stdin.resume();
}

if (import.meta.main) serveStdio();