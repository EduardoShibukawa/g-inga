import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");
const dirs: string[] = [];
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

const ALPHA = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
let n = 0;
const ulid = () => { n += 1; return "0".repeat(24) + ALPHA[Math.floor(n / 32) % 32] + ALPHA[n % 32]; };
const E = (kind: string, data: Record<string, unknown>, scope: Record<string, string> = { plan: "PLAN-0001", task: "TASK-01" }) => ({ v: 1, ts: "2026-10-28T00:00:00Z", source: "manda", kind, id: ulid(), ...scope, data });
const BLOCKER = () => E("blocker", { blocker_id: "b1", question: "qual banco usar?", raised_by: "manda" });

async function load() {
  const router: any = await import(join(ROOT, "src", "notify", "router.ts"));
  const q: any = await import(join(ROOT, "src", "notify", "queue.ts"));
  const dbmod: any = await import(join(ROOT, "src", "state", "db.ts"));
  return { router, q, dbmod };
}

describe("router usa fila durável", () => {
  test("canal falhando mantém item na fila; próximo drain bem-sucedido remove", async () => {
    const { router, q, dbmod } = await load();
    const dir = realpathSync(mkdtempSync(join(realpathSync(tmpdir()), "rrq-")));
    dirs.push(dir);
    const db = dbmod.openStateDb(join(dir, "state.db"));
    const ev = BLOCKER();
    db.run("INSERT INTO events(id, ts, kind, plan, task, json) VALUES(?, ?, ?, ?, ?, ?)", [ev.id, ev.ts, ev.kind, ev.plan, ev.task, JSON.stringify(ev)]);

    const targets = { discord: "discord:123" };

    // primeiro: canal falha
    const sendFail = async () => { throw new Error("hermes down"); };
    await router.routeEvents(db, { send: sendFail, targets });
    expect(q.pending(db).length).toBeGreaterThan(0);

    // segundo: canal ok
    const sendOk = async (m: any) => ({ ok: true });
    await router.routeEvents(db, { send: sendOk, targets });
    expect(q.pending(db).length).toBe(0);
    db.close();
  });
});
