import { afterEach, describe, expect, test } from "bun:test";
import {
  cpFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");
const FIXTURE = join(ROOT, "tests/fixtures/codex-rollout.jsonl");
const OLD_EVENTS = process.env.GINGA_EVENTS;
const dirs: string[] = [];

afterEach(() => {
  if (OLD_EVENTS === undefined) delete process.env.GINGA_EVENTS;
  else process.env.GINGA_EVENTS = OLD_EVENTS;
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

async function loadCodexModule(): Promise<any> {
  try {
    return await import(join(ROOT, "src/quota/codex.ts"));
  } catch {
    return null;
  }
}

function makeHome(): string {
  const home = mkdtempSync(join(tmpdir(), "ginga-codex-home-"));
  dirs.push(home);
  return home;
}

function rolloutPath(home: string, day: string, name: string): string {
  const dir = join(home, "sessions", "2026", "11", day);
  mkdirSync(dir, { recursive: true });
  return join(dir, name);
}

describe("PLAN-0014 TASK-02 — quota do Codex", () => {
  test("usa o último rate_limits do rollout e emite um evento quota", async () => {
    const mod = await loadCodexModule();
    expect(mod).not.toBeNull();

    const home = makeHome();
    const rollout = rolloutPath(home, "02", "rollout-2026-11-02T00-00-00-test.jsonl");
    cpFileSync(FIXTURE, rollout);
    const events = join(home, "events.jsonl");
    process.env.GINGA_EVENTS = events;

    const quota = mod.readCodexQuota(home);
    expect(quota).toMatchObject({
      provider: "chatgpt-go",
      source: "codex-rollout",
      used_pct: 37.5,
      resets_at: "2026-11-03T00:00:00Z",
    });
    expect(typeof quota.window).toBe("string");
    expect(quota.window).toContain("300");

    expect(existsSync(events)).toBe(true);
    const lines = readFileSync(events, "utf8").split("\n").filter(Boolean);
    expect(lines).toHaveLength(1);
    const event = JSON.parse(lines[0]!);
    expect(event).toMatchObject({ v: 1, source: "ginga", kind: "quota" });
    expect(event.data).toMatchObject({
      provider: "chatgpt-go",
      source: "codex-rollout",
      used_pct: 37.5,
      window_minutes: 300,
      resets_at: "2026-11-03T00:00:00Z",
    });
  });

  test("procura o rollout mais recente antes de ler o último rate_limits", async () => {
    const mod = await loadCodexModule();
    expect(mod).not.toBeNull();

    const home = makeHome();
    const oldPath = rolloutPath(home, "01", "rollout-2026-11-01T00-00-00-test.jsonl");
    const newPath = rolloutPath(home, "03", "rollout-2026-11-03T00-00-00-test.jsonl");
    cpFileSync(FIXTURE, oldPath);
    writeFileSync(
      newPath,
      JSON.stringify({
        timestamp: "2026-11-03T00:00:00.000Z",
        type: "event_msg",
        rate_limits: {
          primary: {
            used_percent: 91,
            window_minutes: 43200,
            resets_at: "2026-12-01T00:00:00Z",
          },
        },
      }) + "\n",
    );
    utimesSync(oldPath, 1_000, 1_000);
    utimesSync(newPath, 2_000, 2_000);

    const quota = mod.readCodexQuota(home);
    expect(quota.used_pct).toBe(91);
    expect(quota.resets_at).toBe("2026-12-01T00:00:00Z");
  });

  test("sem rollout devolve quota indisponível", async () => {
    const mod = await loadCodexModule();
    expect(mod).not.toBeNull();

    const home = makeHome();
    mkdirSync(join(home, "sessions"), { recursive: true });
    const quota = mod.readCodexQuota(home);
    expect(quota).toMatchObject({
      provider: "chatgpt-go",
      source: "unavailable",
      used_pct: null,
      resets_at: null,
    });
    expect(typeof quota.window).toBe("string");
  });
});
