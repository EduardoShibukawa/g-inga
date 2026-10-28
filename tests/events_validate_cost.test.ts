import { describe, expect, test } from "bun:test";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");
type Val = { validateEvent: (ev: unknown) => { ok: boolean; errors: string[] } };
const load = async () => (await import(join(ROOT, "src/events/validate.ts"))) as Val;

const attempt = (over: Record<string, unknown> = {}) => ({
  v: 1,
  ts: "2026-10-28T14:02:11.204Z",
  source: "manda",
  kind: "attempt",
  id: "01JBX1000000000000000000AB",
  data: { runtime: "opencode", attempt_n: 1, passed: true },
  ...over,
});

describe("attempt: cost_usd é numérico (docs/events-v1.md:22)", () => {
  test("aceita cost_usd número", async () => {
    const ev = attempt({
      data: { runtime: "opencode", attempt_n: 1, passed: false, failure: "quota_exhausted", cost_usd: 0.25, cost_source: "export" },
    });
    expect((await load()).validateEvent(ev)).toEqual({ ok: true, errors: [] });
  });

  test("reprova cost_usd string", async () => {
    const ev = attempt({
      data: { runtime: "opencode", attempt_n: 1, passed: false, failure: "quota_exhausted", cost_usd: "0.25" },
    });
    expect((await load()).validateEvent(ev).ok).toBe(false);
  });
});
