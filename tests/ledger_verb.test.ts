import { afterAll, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { VERBS, runVerb } from "../src/verbs/registry";

/**
 * T914: verbo `ledger` — lê os receipts por `[commands].ledger` (padrão
 * `pinga ledger list --json --limit 200`) e soma o que a tela Ledger mostra.
 */
const dirs: string[] = [];
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

const ago = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();

function fixture(command: string, payload?: unknown) {
  const ws = mkdtempSync(join(tmpdir(), "ginga-ledger-"));
  dirs.push(ws);
  const root = join(ws, ".ginga");
  mkdirSync(root, { recursive: true });
  writeFileSync(join(root, "project.toml"), `[commands]\nledger = "${command}"\n`);
  if (payload !== undefined) writeFileSync(join(ws, "ledger.json"), JSON.stringify(payload));
  return { by: "dono", via: "api", root, db: new Database(":memory:") };
}

const row = (seq: number, over: Record<string, unknown>) => ({
  seq,
  task: "T1",
  status: "pass",
  flow: "verify",
  repo: "manda",
  model: null,
  reason_code: null,
  created_at: ago(1),
  summary: "ok",
  hash: "a".repeat(64),
  ...over,
});

describe("verbo ledger", () => {
  test("é verbo de leitura do registro", () => {
    const v = VERBS.find((x) => x.name === "ledger");
    expect(v).toBeDefined();
    expect(v!.write).toBe(false);
  });

  test("devolve cadeia, linhas e os números da semana", async () => {
    const ctx = fixture("cat ledger.json", {
      chain: { ok: true, count: 5 },
      total: 5,
      rows: [
        row(5, { status: "blocked", reason_code: "scope_drift" }),
        row(4, {}),
        row(3, { flow: "prove_red", status: "fail", reason_code: "test_passed_on_base" }),
        row(2, { flow: "prove_red" }),
        row(1, { created_at: ago(30) }),
      ],
    });
    const r: any = await runVerb("ledger", ctx, {});
    expect(r.error).toBeUndefined();
    expect(r.chain).toEqual({ ok: true, count: 5 });
    expect(r.total).toBe(5);
    expect(r.rows.map((x: any) => x.seq)).toEqual([5, 4, 3, 2, 1]);
    // só verify dos últimos 7 dias: seq 5 (blocked) e seq 4 (pass)
    expect(r.week).toEqual({ pass: 1, total: 2 });
    // prove-red que não ficou RED
    expect(r.red_failed).toBe(1);
  });

  test("o comando roda na raiz do workspace e recebe {root}", async () => {
    const ctx = fixture("cat {root}/ledger.json", { chain: { ok: true, count: 0 }, total: 0, rows: [] });
    const r: any = await runVerb("ledger", ctx, {});
    expect(r.error).toBeUndefined();
    expect(r.rows).toEqual([]);
    expect(r.week).toEqual({ pass: 0, total: 0 });
  });

  test("cadeia quebrada passa adiante", async () => {
    const ctx = fixture("cat ledger.json", { chain: { ok: false, broken_at: 3 }, total: 4, rows: [] });
    const r: any = await runVerb("ledger", ctx, {});
    expect(r.chain).toEqual({ ok: false, broken_at: 3 });
  });

  test("comando que falha vira error no payload, sem exceção", async () => {
    const r: any = await runVerb("ledger", fixture("exit 3"), {});
    expect(typeof r.error).toBe("string");
    expect(r.error).toContain("3");
    expect(r.rows).toEqual([]);
    expect(r.chain).toBeNull();
  });

  test("resposta que não é JSON vira error", async () => {
    const r: any = await runVerb("ledger", fixture("echo oi"), {});
    expect(typeof r.error).toBe("string");
    expect(r.rows).toEqual([]);
  });
});
