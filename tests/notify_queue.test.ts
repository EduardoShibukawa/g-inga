import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");
const dirs: string[] = [];
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

async function load() {
  const q: any = await import(join(ROOT, "src", "notify", "queue.ts"));
  const dbmod: any = await import(join(ROOT, "src", "state", "db.ts"));
  return { q, dbmod };
}

describe("notify queue durable", () => {
  test("enqueue + pending + dedupe por key", async () => {
    const { q, dbmod } = await load();
    const dir = realpathSync(mkdtempSync(join(realpathSync(tmpdir()), "q-")));
    dirs.push(dir);
    const db = dbmod.openStateDb(join(dir, "state.db"));
    const id1 = q.enqueue(db, { dedupe_key: "k1", severity: "high", text: "msg1" });
    const id2 = q.enqueue(db, { dedupe_key: "k1", severity: "high", text: "msg2" });
    expect(id2).toBe(id1);
    expect(q.pending(db).length).toBe(1);
    db.close();
  });

  test("falha de envio mantém item na fila; sucesso na próxima conexão remove", async () => {
    const { q, dbmod } = await load();
    const dir = realpathSync(mkdtempSync(join(realpathSync(tmpdir()), "q-")));
    dirs.push(dir);
    const db = dbmod.openStateDb(join(dir, "state.db"));
    q.enqueue(db, { id: "a1", dedupe_key: "a", severity: "high", text: "alerta", target: "discord:1" });

    const sent1: any[] = [];
    const sendFail = async () => { sent1.push("x"); throw new Error("hermes down"); };
    const r1 = await q.drain(db, { send: sendFail });
    expect(q.pending(db).length).toBe(1);
    expect(r1.failed).toBe(1);

    const sent2: any[] = [];
    const sendOk = async (m: any) => { sent2.push(m); return { ok: true }; };
    const r2 = await q.drain(db, { send: sendOk });
    expect(q.pending(db).length).toBe(0);
    expect(r2.delivered).toBe(1);
    expect(sent2.length).toBe(1);
    db.close();
  });

  test("digest de N itens num envio", async () => {
    const { q, dbmod } = await load();
    const dir = realpathSync(mkdtempSync(join(realpathSync(tmpdir()), "q-")));
    dirs.push(dir);
    const db = dbmod.openStateDb(join(dir, "state.db"));
    q.enqueue(db, { id: "b1", dedupe_key: "b1", severity: "info", text: "um", target: "discord:1" });
    q.enqueue(db, { id: "b2", dedupe_key: "b2", severity: "info", text: "dois", target: "discord:1" });

    const sent: any[] = [];
    const send = async (m: any) => { sent.push(m); return { ok: true }; };
    const r = await q.drain(db, { send });
    expect(sent.length).toBe(1);
    expect(sent[0].text).toContain("Digest");
    expect(q.pending(db).length).toBe(0);
    db.close();
  });
});
