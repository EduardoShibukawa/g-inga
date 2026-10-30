// Uso de contexto do transcript JSONL de uma sessão interativa (doc 11 §3).
// Lê o ÚLTIMO bloco `usage` de uma mensagem `assistant` para determinar
// contextTokens (input + cache_read + cache_creation) e lastApiTs.

import { readFileSync } from "node:fs";

export function transcriptUsage(path: string): { contextTokens: number; lastApiTs: Date | null } {
  let content: string;
  try {
    content = readFileSync(path, "utf8");
  } catch {
    return { contextTokens: -1, lastApiTs: null };
  }

  let contextTokens = -1;
  let lastApiTs: Date | null = null;

  for (const line of content.split("\n")) {
    if (!line.trim()) continue;
    try {
      const event = JSON.parse(line);
      if (event.type === "assistant" && event.usage) {
        const u = event.usage;
        contextTokens =
          (u.input_tokens || 0) +
          (u.cache_read_input_tokens || 0) +
          (u.cache_creation_input_tokens || 0);
        lastApiTs = event.timestamp ? new Date(event.timestamp) : lastApiTs;
      }
    } catch {
      // skip malformed lines
    }
  }

  return { contextTokens, lastApiTs };
}
