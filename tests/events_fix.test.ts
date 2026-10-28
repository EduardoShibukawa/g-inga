import { describe, expect, test } from "bun:test";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");
type Val = { validateEvent: (ev: unknown) => { ok: boolean; errors: string[] } };
const load = async () => (await import(join(ROOT, "src/events/validate.ts"))) as Val;

const env = (over: Record<string, unknown> = {}) => ({
  v: 1,
  ts: "2026-10-27T14:02:11.204Z",
  source: "pinga",
  kind: "receipt",
  id: "01JBX0000000000000000000AA",
  data: { ledger_n: 3, hash: "a".repeat(64), status: "pass", check: "verify" },
  ...over,
});

describe("ts ISO 8601 estrito (UTC, Z)", () => {
  for (const ts of ["27/10/2026", "2026-10-27", "Tue Oct 27 2026", "2026-10-27 14:02:11", "2026-10-27T14:02:11+03:00"]) {
    test(`reprova ${ts}`, async () => {
      expect((await load()).validateEvent(env({ ts })).ok).toBe(false);
    });
  }
  for (const ts of ["2026-10-27T14:02:11Z", "2026-10-27T14:02:11.204Z"]) {
    test(`aceita ${ts}`, async () => {
      expect((await load()).validateEvent(env({ ts })).ok).toBe(true);
    });
  }
});

describe("receipt", () => {
  test("check: bdd sem ledger_n/hash é válido (BDD não tem ledger)", async () => {
    const ev = env({ source: "pi-harness", data: { status: "pass", check: "bdd" } });
    expect((await load()).validateEvent(ev)).toEqual({ ok: true, errors: [] });
  });
  test("check: verify sem ledger_n/hash continua inválido", async () => {
    expect((await load()).validateEvent(env({ data: { status: "pass", check: "verify" } })).ok).toBe(false);
  });
  test("check: plan (receipt de PLAN do pinga) é aceito", async () => {
    const ev = env({ data: { ledger_n: 9, hash: "b".repeat(64), status: "blocked", check: "plan", reason_code: "tasks_open" } });
    expect((await load()).validateEvent(ev)).toEqual({ ok: true, errors: [] });
  });
});
