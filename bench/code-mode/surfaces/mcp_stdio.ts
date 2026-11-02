/**
 * MCP stdio mínima - JSON-RPC 2.0 para o modo M.
 * Lê stdin line-by-line, processa requests e escreve stdout.
 * Suporta: initialize, tools/list, tools/call.
 * Sem dependência externa.
 */

import { handle } from "./m";

function parseMessage(line: string): { jsonrpc: "2.0"; id: number; method: string; params?: any } | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  try {
    const msg = JSON.parse(trimmed) as any;
    if (msg.jsonrpc === "2.0" && msg.method) {
      return { jsonrpc: "2.0", id: msg.id, method: msg.method, params: msg.params };
    }
  } catch {
    // ignore malformed lines
  }
  return null;
}

function sendMessage(msg: any): void {
  process.stdout.write(JSON.stringify(msg) + "\n");
}

buffer = "";

process.stdin.on("data", (data) => {
  buffer += data.toString();
});

process.stdin.on("end", () => {
  // Process any remaining data
  processMessages();
});

function processMessages(): void {
  const lines = buffer.split("\n");
  buffer = lines.pop() || ""; // keep incomplete line in buffer

  for (const line of lines) {
    const msg = parseMessage(line);
    if (!msg) continue;

    const { id, method, params } = msg;

    if (method === "initialize") {
      sendMessage({
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: "2024-11-05",
          capabilities: {
            tools: {}
          },
          serverInfo: { name: "mcp-stdio", version: "0.1.0" }
        }
      });
    } else if (method === "tools/list") {
      const listResult = handle({ id, method, params }, "") as any;
      sendMessage({
        jsonrpc: "2.0",
        id,
        result: listResult.result
      });
    } else if (method === "tools/call") {
      const toolName = params?.name;
      const args = params?.arguments ?? {};
      const snapshot = params?.snapshot || "";
      const callResult = handle({ id, method, params: { name: toolName, arguments: args, snapshot } }, snapshot);
      sendMessage(callResult);
    }
  }
}

// Handle stdin pipe end
process.stdin.resume();

// Se houver dados completos imediatamente, processa
if (buffer.length > 0) {
  processMessages();
}