import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { transcriptUsage } from "../src/handoff/transcript_usage.ts";

// RED — PLAN-0013 TASK-26 (grave do judge 2026-11-01, TASK-12 + AC handoff automático):
// transcript real do Claude Code traz o `usage` em `message.usage`; a raiz da linha
// não tem `usage`. Hoje `transcriptUsage` lê só a raiz → contextTokens -1 e
// lastApiTs null no uso real, e nenhum gatilho (idle/context) dispara no hook.

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function writeTranscript(lines: unknown[]): string {
  const dir = realpathSync(mkdtempSync(join(realpathSync(tmpdir()), "ginga-transcript-")));
  dirs.push(dir);
  const p = join(dir, "session.jsonl");
  writeFileSync(p, lines.map((l) => JSON.stringify(l)).join("\n") + "\n");
  return p;
}

describe("transcriptUsage — formato real do Claude (message.usage)", () => {
  test("usage em message.usage (raiz sem usage) soma input + cache_read + cache_creation", () => {
    const p = writeTranscript([
      { type: "user", timestamp: "2026-10-31T10:00:00.000Z", message: { role: "user", content: "oi" } },
      {
        type: "assistant",
        timestamp: "2026-10-31T10:00:05.000Z",
        message: {
          role: "assistant",
          content: [{ type: "text", text: "olá" }],
          usage: { input_tokens: 20000, cache_read_input_tokens: 90000, cache_creation_input_tokens: 10000 },
        },
      },
    ]);
    const u = transcriptUsage(p);
    expect(u.contextTokens).toBe(120000);
    expect(u.lastApiTs).toEqual(new Date("2026-10-31T10:00:05.000Z"));
  });

  test("pega o último assistant com usage e ignora linhas sem usage", () => {
    const p = writeTranscript([
      { type: "assistant", timestamp: "2026-10-31T09:00:00.000Z", message: { role: "assistant", usage: { input_tokens: 1, cache_read_input_tokens: 2, cache_creation_input_tokens: 3 } } },
      { type: "assistant", timestamp: "2026-10-31T10:00:00.000Z", message: { role: "assistant", content: [] } },
      { type: "assistant", timestamp: "2026-10-31T11:00:00.000Z", message: { role: "assistant", usage: { input_tokens: 5000, cache_read_input_tokens: 30000, cache_creation_input_tokens: 5000 } } },
    ]);
    const u = transcriptUsage(p);
    expect(u.contextTokens).toBe(40000);
    expect(u.lastApiTs).toEqual(new Date("2026-10-31T11:00:00.000Z"));
  });

  test("sem usage em lugar nenhum → contextTokens -1 e lastApiTs null", () => {
    const p = writeTranscript([
      { type: "assistant", timestamp: "2026-10-31T10:00:00.000Z", message: { role: "assistant", content: [{ type: "text", text: "oi" }] } },
    ]);
    expect(transcriptUsage(p)).toEqual({ contextTokens: -1, lastApiTs: null });
  });

  test("formato antigo (usage na raiz da linha) continua aceito", () => {
    const p = writeTranscript([
      { type: "assistant", timestamp: "2026-10-31T10:00:05.000Z", message: { role: "assistant", content: [] }, usage: { input_tokens: 1000, cache_read_input_tokens: 30000, cache_creation_input_tokens: 9000 } },
    ]);
    const u = transcriptUsage(p);
    expect(u.contextTokens).toBe(40000);
    expect(u.lastApiTs).toEqual(new Date("2026-10-31T10:00:05.000Z"));
  });
});
