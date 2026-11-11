import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * T914: tela "Ledger e Bench" da Roda Web. A tela só mostra o que o verbo
 * `ledger` devolve; o filtro por status é a única coisa que ela decide.
 */
const WEB = join(import.meta.dir, "..", "web");
const load = async (): Promise<any> => import(join(WEB, "ledger.js"));

const payload = {
  chain: { ok: true, count: 418 },
  total: 418,
  week: { pass: 37, total: 44 },
  red_failed: 0,
  rows: [
    { seq: 418, task: "T909", status: "pass", flow: "verify", repo: "manda", model: "glm-5", created_at: "2026-11-10T11:37:25.463Z", hash: "abcdef0123456789".repeat(4), summary: "ok" },
    { seq: 417, task: "T908", status: "blocked", flow: "verify", repo: "g-inga", model: null, created_at: "2026-11-10T10:00:00.000Z", hash: "f".repeat(64), reason_code: "scope_drift", summary: "<b>x</b>" },
    { seq: 416, task: "T908", status: "pass", flow: "prove_red", repo: "g-inga", model: null, created_at: "2026-11-10T09:00:00.000Z", hash: "1".repeat(64), summary: "red" },
  ],
};

describe("renderLedgerHtml", () => {
  test("mostra a cadeia, os receipts da semana e o prove-red sem RED", async () => {
    const { renderLedgerHtml } = await load();
    const html = renderLedgerHtml(payload);
    expect(html).toContain("íntegra");
    expect(html).toContain("418 blocos");
    expect(html).toContain("37 / 44");
    expect(html).toMatch(/data-kpi="red-failed"[\s\S]*?>0</);
  });

  test("cadeia quebrada aparece como quebrada, com o bloco", async () => {
    const { renderLedgerHtml } = await load();
    const html = renderLedgerHtml({ ...payload, chain: { ok: false, broken_at: 12 } });
    expect(html).toContain("quebrada");
    expect(html).toContain("bloco 12");
    expect(html).not.toContain("íntegra");
  });

  test("uma linha por receipt, com hash curto e HTML escapado", async () => {
    const { renderLedgerHtml } = await load();
    const html = renderLedgerHtml(payload);
    expect(html.match(/<tr data-seq=/g)?.length).toBe(3);
    expect(html).toContain("abcdef01");
    expect(html).not.toContain("abcdef0123456789abcdef");
    expect(html).toContain("prove-red");
    expect(html).toContain("scope_drift");
    expect(html).not.toContain("<b>x</b>");
  });

  test("filtro por status deixa só as linhas daquele status", async () => {
    const { renderLedgerHtml } = await load();
    const html = renderLedgerHtml(payload, { status: "blocked" });
    expect(html.match(/<tr data-seq=/g)?.length).toBe(1);
    expect(html).toContain('data-seq="417"');
    expect(html).toMatch(/data-ledger-filter="blocked"[^>]*aria-pressed="true"/);
  });

  test("erro do verbo aparece no lugar da tabela", async () => {
    const { renderLedgerHtml } = await load();
    const html = renderLedgerHtml({ chain: null, total: 0, rows: [], week: { pass: 0, total: 0 }, red_failed: 0, error: "pinga: comando não encontrado" });
    expect(html).toContain("pinga: comando não encontrado");
    expect(html).not.toContain("<table");
  });

  test("sem receipts: estado vazio", async () => {
    const { renderLedgerHtml } = await load();
    const html = renderLedgerHtml({ chain: { ok: true, count: 0 }, total: 0, rows: [], week: { pass: 0, total: 0 }, red_failed: 0 });
    expect(html).toContain("Nenhum receipt");
  });

  test("aba Bench avisa que ainda não há SPEC com bench", async () => {
    const { renderLedgerHtml } = await load();
    const html = renderLedgerHtml(payload, { tab: "bench" });
    expect(html).toContain("Nenhuma SPEC com bench");
    expect(html).not.toContain("<table");
  });
});

describe("loadLedger", () => {
  test("POST no verbo ledger e monta a tela no host", async () => {
    const { loadLedger } = await load();
    const calls: string[] = [];
    const fetcher = async (url: string) => {
      calls.push(url);
      return new Response(JSON.stringify(payload));
    };
    const host = { innerHTML: "" };
    await loadLedger(host, fetcher);
    expect(calls).toEqual(["/v1/verbs/ledger"]);
    expect(host.innerHTML).toContain("418 blocos");
  });

  test("API fora do ar: a tela diz o motivo", async () => {
    const { loadLedger } = await load();
    const host = { innerHTML: "" };
    await loadLedger(host, async () => new Response(JSON.stringify({ error: "fora do ar" }), { status: 500 }));
    expect(host.innerHTML).toContain("fora do ar");
  });
});

describe("casca", () => {
  const html = readFileSync(join(WEB, "index.html"), "utf8");
  test("index.html tem a seção, o link e o módulo", () => {
    expect(html).toContain('id="view-ledger"');
    expect(html).toContain('href="#ledger"');
    expect(html).toContain("data-ledger");
    expect(html).toMatch(/<script type="module" src="\/?ledger\.js"><\/script>/);
  });
  test("app.js conhece a view ledger", () => {
    expect(readFileSync(join(WEB, "app.js"), "utf8")).toContain('"ledger"');
  });
  test("style.css tem as regras da tela", () => {
    expect(readFileSync(join(WEB, "style.css"), "utf8")).toContain(".ledger-table");
  });
});
