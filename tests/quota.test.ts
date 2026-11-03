import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openStateDb } from "../src/state/db";

const ROOT = join(import.meta.dir, "..");
const BIN = join(ROOT, "bin", "ginga.ts");
const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

type Fixture = {
  dir: string;
  home: string;
  root: string;
  dbPath: string;
  claudePath: string;
};

function fixture(): Fixture {
  const dir = realpathSync(mkdtempSync(join(realpathSync(tmpdir()), "ginga-quota-")));
  dirs.push(dir);
  const home = join(dir, "home");
  const root = join(dir, "bundle");
  mkdirSync(root, { recursive: true });
  mkdirSync(home, { recursive: true });

  const claudePath = join(home, ".local", "state", "ginga", "claude-rate-limits.json");
  mkdirSync(join(home, ".local", "state", "ginga"), { recursive: true });
  writeFileSync(
    claudePath,
    JSON.stringify({
      rate_limits: {
        five_hour: { used_percent: 42, resets_at: "2026-11-02T20:00:00Z" },
        seven_day: { used_percent: 13, resets_at: "2026-11-09T00:00:00Z" },
      },
    }),
  );

  const rollout = join(home, ".codex", "sessions", "2026", "11", "02", "rollout-quota.jsonl");
  mkdirSync(join(home, ".codex", "sessions", "2026", "11", "02"), { recursive: true });
  writeFileSync(
    rollout,
    JSON.stringify({
      payload: {
        rate_limits: {
          primary: { used_percent: 80, window_minutes: 43_200, resets_at: "2026-12-01T00:00:00Z" },
        },
      },
    }) + "\n",
  );

  const dbPath = join(dir, "state.db");
  const db = openStateDb(dbPath);
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const previousMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 15)).toISOString();
  const insert = db.prepare("INSERT INTO events(id, ts, kind, plan, task, json) VALUES(?, ?, 'cost', NULL, NULL, ?)");
  insert.run(
    "01JC0000000000000000000000",
    monthStart,
    JSON.stringify({ v: 1, ts: monthStart, source: "ginga", kind: "cost", id: "01JC0000000000000000000000", data: { amount_usd: 2.5, model: "opencode/glm-5.3-flash" } }),
  );
  insert.run(
    "01JC0000000000000000000001",
    previousMonth,
    JSON.stringify({ v: 1, ts: previousMonth, source: "ginga", kind: "cost", id: "01JC0000000000000000000001", data: { amount_usd: 7.5, model: "opencode/glm-5.3-flash" } }),
  );
  db.close();

  return { dir, home, root, dbPath, claudePath };
}

describe("PLAN-0014 TASK-03 — quota do Claude e ginga quota", () => {
  test("a statusline grava five_hour e seven_day no HOME", () => {
    const fx = fixture();
    const input = JSON.stringify({
      rate_limits: {
        five_hour: { used_percent: 42, resets_at: "2026-11-02T20:00:00Z" },
        seven_day: { used_percent: 13, resets_at: "2026-11-09T00:00:00Z" },
      },
    });
    const script = join(ROOT, "contrib", "claude-statusline.sh");
    const proc = Bun.spawnSync(["bash", script], {
      env: { ...process.env, HOME: fx.home, GINGA_EVENTS: "" },
      stdin: new TextEncoder().encode(input),
    });
    expect(proc.exitCode).toBe(0);
    expect(proc.stdout.toString().trim()).not.toBe("");

    const saved = JSON.parse(readFileSync(fx.claudePath, "utf8"));
    expect(saved.rate_limits.five_hour.used_percent).toBe(42);
    expect(saved.rate_limits.seven_day.used_percent).toBe(13);
  });

  test("readClaudeQuota lê a quota automática da statusline", async () => {
    const fx = fixture();
    expect(existsSync(join(ROOT, "src", "quota", "claude.ts"))).toBe(true);
    const mod = await import("../src/quota/claude.ts");
    expect(mod.readClaudeQuota(fx.claudePath)).toMatchObject({
      provider: "claude-pro",
      used_pct: 42,
      resets_at: "2026-11-02T20:00:00Z",
      source: "claude-statusline",
    });
  });

  test("readQuotas junta Claude, Codex, providers manuais e o gasto do mês", async () => {
    const fx = fixture();
    expect(existsSync(join(ROOT, "src", "quota", "index.ts"))).toBe(true);
    const mod = await import("../src/quota/index.ts");
    const db = openStateDb(fx.dbPath);
    try {
      const quotas = mod.readQuotas({ home: fx.home, db });
      const byProvider = new Map(quotas.map((quota: { provider: string }) => [quota.provider, quota]));
      expect(byProvider.get("claude-pro")).toMatchObject({ used_pct: 42, source: "claude-statusline" });
      expect(byProvider.get("chatgpt-go")).toMatchObject({ used_pct: 80, source: "codex-rollout" });
      expect(byProvider.get("gemini-pro")).toMatchObject({ used_pct: null, source: "manual" });
      expect(byProvider.get("opencode-go")).toMatchObject({ used_pct: null, source: "manual" });
      expect(byProvider.get("zen")).toMatchObject({ used_pct: 25, source: "opencode-db" });
      expect(quotas.filter((quota: { source: string }) => quota.source === "manual")).toHaveLength(2);
    } finally {
      db.close();
    }
  });

  test("ginga quota --json expõe as quotas sem tocar o HOME real", () => {
    const fx = fixture();
    const proc = Bun.spawnSync([process.execPath, BIN, "quota", "--json", "--root", fx.root], {
      env: { ...process.env, HOME: fx.home, GINGA_STATE_DB: fx.dbPath, GINGA_EVENTS: "" },
      cwd: fx.dir,
    });
    expect(proc.exitCode).toBe(0);
    const payload = JSON.parse(proc.stdout.toString());
    const items = Array.isArray(payload) ? payload : payload.items;
    expect(items.map((quota: { provider: string }) => quota.provider)).toEqual(
      expect.arrayContaining(["claude-pro", "chatgpt-go", "gemini-pro", "opencode-go", "zen"]),
    );
  });
});
