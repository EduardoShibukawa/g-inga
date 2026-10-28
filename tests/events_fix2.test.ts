import { describe, expect, test } from "bun:test";
import { join } from "node:path";

// Judge rodada 5 (Codex): transition.data.by aceita <papel> (qualquer papel),
// conforme docs/events-v1.md:26 — não só owner/system.
const ROOT = join(import.meta.dir, "..");
type Val = { validateEvent: (ev: unknown) => { ok: boolean; errors: string[] } };
const load = async () => (await import(join(ROOT, "src/events/validate.ts"))) as Val;

const env = (by: string) => ({
  v: 1,
  ts: "2026-10-27T14:02:11.204Z",
  source: "ginga",
  kind: "transition",
  id: "01JBX0000000000000000000AA",
  data: { entity: "task", from: "a", to: "b", by, via: "cli" },
});

describe("transition.data.by aceita <papel>", () => {
  for (const by of ["owner", "system", "planner", "judge", "red-team", "executor"]) {
    test(`aceita by=${by}`, async () => {
      expect((await load()).validateEvent(env(by))).toEqual({ ok: true, errors: [] });
    });
  }
  test("by não-string continua inválido", async () => {
    const ev = env("owner");
    (ev.data as Record<string, unknown>).by = 42;
    expect((await load()).validateEvent(ev).ok).toBe(false);
  });
});
