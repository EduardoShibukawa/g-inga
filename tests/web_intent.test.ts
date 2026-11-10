import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * T913: "+ Intent" na Roda Web. A tela só encaminha para o verbo
 * `intent new` (/v1/verbs/intent-new); a triagem continua no ginga.
 */
const WEB = join(import.meta.dir, "..", "web");
const load = async (): Promise<any> => import(join(WEB, "intent.js"));

describe("intentRequest", () => {
  test("texto aparado e trilha explícita viram o corpo do verbo", async () => {
    const { intentRequest } = await load();
    expect(intentRequest("  quero X \n", "small")).toEqual({ path: "/v1/verbs/intent-new", body: { text: "quero X", track: "small" } });
    expect(intentRequest("quero Y", "feature").body).toEqual({ text: "quero Y", track: "feature" });
  });

  test("trilha auto (ou vazia) não manda track: a triagem decide", async () => {
    const { intentRequest } = await load();
    expect(intentRequest("quero X", "auto").body).toEqual({ text: "quero X" });
    expect(intentRequest("quero X", "").body).toEqual({ text: "quero X" });
  });

  test("texto vazio é recusado antes de chamar a API", async () => {
    const { intentRequest } = await load();
    expect(() => intentRequest("   ", "auto")).toThrow();
  });
});

describe("submitIntent", () => {
  test("POST no verbo e devolve o INTENT criado", async () => {
    const { submitIntent } = await load();
    const calls: { url: string; body: unknown }[] = [];
    const fetcher = async (url: string, init: { body: string }) => {
      calls.push({ url, body: JSON.parse(init.body) });
      return new Response(JSON.stringify({ id: "INTENT-0009", track: "small", reasons: ["flag do usuário: small"] }));
    };
    const r = await submitIntent("custo do mês por provider", "small", fetcher);
    expect(calls).toEqual([{ url: "/v1/verbs/intent-new", body: { text: "custo do mês por provider", track: "small" } }]);
    expect(r.id).toBe("INTENT-0009");
  });

  test("erro da API vira exceção com a mensagem dela", async () => {
    const { submitIntent } = await load();
    const fetcher = async () => new Response(JSON.stringify({ error: "bundle somente leitura" }), { status: 500 });
    await expect(submitIntent("x", "auto", fetcher)).rejects.toThrow("bundle somente leitura");
  });

  test("intentSummary descreve o resultado para o dono", async () => {
    const { intentSummary } = await load();
    expect(intentSummary({ id: "INTENT-0009", track: "small", reasons: ["1 arquivo", "sem contrato novo"] })).toBe(
      "INTENT-0009 criado · trilha pequena (1 arquivo; sem contrato novo)",
    );
    expect(intentSummary({ id: "INTENT-0010", track: "feature", reasons: [] })).toBe("INTENT-0010 criado · trilha feature");
  });
});

describe("casca", () => {
  const html = readFileSync(join(WEB, "index.html"), "utf8");
  const css = readFileSync(join(WEB, "style.css"), "utf8");

  test("index.html tem o botão, o formulário e carrega o módulo", () => {
    expect(html).toContain("data-intent-open");
    expect(html).toContain("data-intent-form");
    expect(html).toContain('id="intent-text"');
    expect(html).toContain('id="intent-track"');
    expect(html).toContain("data-intent-result");
    expect(html).toMatch(/<script type="module" src="\/?intent\.js"><\/script>/);
  });

  test("os cartões e botões do Inbox têm estilo, com alvo de toque de 44px", () => {
    expect(css).toContain(".inbox-card");
    expect(css).toContain(".inbox-kind");
    expect(css).toMatch(/\.inbox-action\s*\{[^}]*min-height:\s*44px/);
    expect(css).toContain(".intent-form");
  });
});
