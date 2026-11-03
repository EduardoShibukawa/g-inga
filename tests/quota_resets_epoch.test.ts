import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");
const OLD_EVENTS = process.env.GINGA_EVENTS;
const dirs: string[] = [];

afterEach(() => {
  if (OLD_EVENTS === undefined) delete process.env.GINGA_EVENTS;
  else process.env.GINGA_EVENTS = OLD_EVENTS;
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function makeHome(): string {
  const home = mkdtempSync(join(tmpdir(), "ginga-quota-epoch-"));
  dirs.push(home);
  return home;
}

function rollout(home: string, lines: unknown[]): string {
  const dir = join(home, "sessions", "2026", "11", "03");
  mkdirSync(dir, { recursive: true });
  const path = join(dir, "rollout-2026-11-03T00-00-00-real.jsonl");
  writeFileSync(path, lines.map((l) => JSON.stringify(l)).join("\n") + "\n");
  return path;
}

const EPOCH_S = 1795285686; // formato real dos rollouts do Codex (~/.codex/sessions)
const EPOCH_MS = 1795285686000;
const ISO_S = new Date(EPOCH_S * 1000).toISOString();
const ISO_MS = new Date(EPOCH_MS).toISOString();

describe("PLAN-0014 TASK-18 — resets_at em epoch numérico (formato real Codex/Claude)", () => {
  test("codex: rollout real com resets_at numérico gera quota completa, evento quota e cap_ok bloqueado", async () => {
    const codex = await import(join(ROOT, "src/quota/codex.ts"));
    const { quotaCapOk } = await import(join(ROOT, "src/quota/index.ts"));

    const home = makeHome();
    rollout(home, [
      {
        timestamp: "2026-11-03T00:00:00.000Z",
        type: "event_msg",
        rate_limits: { primary: { used_percent: 100, window_minutes: 43200, resets_at: EPOCH_S } },
      },
    ]);
    const events = join(home, "events.jsonl");
    process.env.GINGA_EVENTS = events;

    const quota = codex.readCodexQuota(home);
    expect(quota.source).toBe("codex-rollout");
    expect(quota.used_pct).toBe(100);
    expect(quota.resets_at).toBe(ISO_S);
    expect(quotaCapOk([quota])).toBe(false);

    expect(existsSync(events)).toBe(true);
    const lines = readFileSync(events, "utf8").split("\n").filter(Boolean);
    expect(lines).toHaveLength(1);
    const event = JSON.parse(lines[0]!);
    expect(event).toMatchObject({ v: 1, source: "ginga", kind: "quota" });
    expect(event.data).toMatchObject({
      provider: "chatgpt-go",
      source: "codex-rollout",
      used_pct: 100,
      window_minutes: 43200,
      resets_at: ISO_S,
    });
    expect(typeof event.data.resets_at).toBe("string");
  });

  test("codex: epoch em milissegundos (> 1e12) também é normalizado para ISO", async () => {
    const codex = await import(join(ROOT, "src/quota/codex.ts"));
    const home = makeHome();
    rollout(home, [
      { rate_limits: { primary: { used_percent: 12, window_minutes: 300, resets_at: EPOCH_MS } } },
    ]);
    const quota = codex.readCodexQuota(home);
    expect(quota.source).toBe("codex-rollout");
    expect(quota.resets_at).toBe(ISO_MS);
  });

  test("codex: último rate_limits vence mesmo misturando ISO e epoch; string ISO continua aceita", async () => {
    const codex = await import(join(ROOT, "src/quota/codex.ts"));
    const home = makeHome();
    rollout(home, [
      { rate_limits: { primary: { used_percent: 10, window_minutes: 300, resets_at: "2026-11-02T15:00:00Z" } } },
      { rate_limits: { primary: { used_percent: 55, window_minutes: 300, resets_at: EPOCH_S } } },
    ]);
    const quota = codex.readCodexQuota(home);
    expect(quota).toMatchObject({ source: "codex-rollout", used_pct: 55, resets_at: ISO_S });
  });

  test("codex: resets_at inválido (objeto) continua stale, sem evento", async () => {
    const codex = await import(join(ROOT, "src/quota/codex.ts"));
    const home = makeHome();
    rollout(home, [
      { rate_limits: { primary: { used_percent: 30, window_minutes: 300, resets_at: { at: EPOCH_S } } } },
    ]);
    const events = join(home, "events.jsonl");
    process.env.GINGA_EVENTS = events;
    const quota = codex.readCodexQuota(home);
    expect(quota.source).toBe("stale");
    expect(quota.resets_at).toBeNull();
    expect(existsSync(events)).toBe(false);
  });

  test("claude: statusline com five_hour.resets_at em epoch numérico vira claude-statusline", async () => {
    const { readClaudeQuota } = await import(join(ROOT, "src/quota/claude.ts"));
    const home = makeHome();
    const path = join(home, "claude-rate-limits.json");
    writeFileSync(
      path,
      JSON.stringify({
        rate_limits: {
          five_hour: { used_percent: 42, resets_at: EPOCH_S },
          seven_day: { used_percent: 13, resets_at: "2026-11-09T00:00:00Z" },
        },
      }),
    );
    const quota = readClaudeQuota(path);
    expect(quota).toMatchObject({
      provider: "claude-pro",
      source: "claude-statusline",
      used_pct: 42,
      resets_at: ISO_S,
    });
  });

  test("claude: resets_at em ms na statusline também normaliza; inválido continua stale", async () => {
    const { readClaudeQuota } = await import(join(ROOT, "src/quota/claude.ts"));
    const home = makeHome();
    const msPath = join(home, "ms.json");
    writeFileSync(msPath, JSON.stringify({ rate_limits: { five_hour: { used_percent: 1, resets_at: EPOCH_MS } } }));
    expect(readClaudeQuota(msPath).resets_at).toBe(ISO_MS);

    const badPath = join(home, "bad.json");
    writeFileSync(badPath, JSON.stringify({ rate_limits: { five_hour: { used_percent: 1, resets_at: true } } }));
    const stale = readClaudeQuota(badPath);
    expect(stale.source).toBe("stale");
    expect(stale.resets_at).toBeNull();
  });
});
