/** MCP stdio mínima — JSON-RPC 2.0, uma requisição por linha. */

import { handle } from "./m";

type Request = {
  jsonrpc: "2.0";
  id: number | string | null;
  method: string;
  params?: any;
};

function snapshotFromArgv(): string {
  const index = process.argv.indexOf("--snapshot");
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  return value && !value.startsWith("--") ? value : process.cwd();
}

const snapshot = snapshotFromArgv();
let buffer = "";

function send(message: unknown): void {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function parseRequest(line: string): Request | null {
  try {
    const value = JSON.parse(line) as Partial<Request>;
    if (value.jsonrpc !== "2.0" || typeof value.method !== "string") return null;
    return {
      jsonrpc: "2.0",
      id: value.id ?? null,
      method: value.method,
      params: value.params,
    };
  } catch {
    return null;
  }
}

function toolResult(value: unknown): unknown {
  if (value && typeof value === "object" && "error" in value) return value;
  return {
    content: [
      {
        type: "text",
        text: typeof value === "string" ? value : JSON.stringify(value),
      },
    ],
  };
}

function processRequest(request: Request): void {
  if (request.method === "initialize") {
    send({
      jsonrpc: "2.0",
      id: request.id,
      result: {
        protocolVersion: "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "ginga-code-mode-m", version: "0.1.0" },
      },
    });
    return;
  }

  const response = handle(
    { id: Number(request.id), method: request.method, params: request.params },
    snapshot,
  ) as any;
  if (request.method === "tools/call" && response?.result) {
    response.result = toolResult(response.result);
  }
  send(response);
}

function processBuffer(final = false): void {
  const lines = buffer.split("\n");
  buffer = final ? "" : (lines.pop() ?? "");
  for (const line of lines) {
    if (!line.trim()) continue;
    const request = parseRequest(line);
    if (!request) {
      send({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } });
      continue;
    }
    processRequest(request);
  }
  if (final && buffer.trim()) {
    const request = parseRequest(buffer);
    buffer = "";
    if (request) processRequest(request);
  }
}

process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk: string) => {
  buffer += chunk;
  processBuffer();
});
process.stdin.on("end", () => processBuffer(true));
process.stdin.resume();
