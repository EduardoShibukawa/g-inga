import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * T915: tela "SPEC aberta" da Roda Web. Só mostra o que o verbo `spec`
 * devolve e encaminha para `approve`, `reject` e `answer`.
 */
const WEB = join(import.meta.dir, "..", "web");
const load = async (): Promise<any> => import(join(WEB, "spec.js"));

const spec = {
  id: "SPEC-0001",
  file: "specs/SPEC-0001-ginga-revamp.md",
  title: "G-Ingá <revamp>",
  status: "draft",
  intent: "INTENT-0001",
  bench: "none",
  objective: "Separar o harness.",
  acs: [
    { id: "AC-1", text: "pinga verify roda sozinho" },
    { id: "AC-2", text: "sem runtime citado" },
  ],
  blockers: [{ id: "b-nome", question: "Qual o nome?", raised_by: "spec-judge", options: ["Manda-CARU", "Mand-Ingá"] }],
  answers: [{ blocker_id: "b-velho", question: "Já?", answer: "sim", by: "dono", via: "api", ts: "2026-10-27T10:00:00Z" }],
  sections: [{ title: "Notas", body: "Texto livre." }],
};

describe("renderSpecHtml", () => {
  test("cabeçalho, objetivo e critérios de aceite, com HTML escapado", async () => {
    const { renderSpecHtml } = await load();
    const html = renderSpecHtml(spec);
    expect(html).toContain("SPEC-0001");
    expect(html).toContain("G-Ingá &lt;revamp&gt;");
    expect(html).not.toContain("<revamp>");
    expect(html).toContain("INTENT-0001");
    expect(html).toContain("specs/SPEC-0001-ginga-revamp.md");
    expect(html).toContain("Separar o harness.");
    expect(html.match(/data-ac="/g)?.length).toBe(2);
    expect(html).toContain("Notas");
  });

  test("blocker aberto mostra a pergunta, as opções e o campo de resposta", async () => {
    const { renderSpecHtml } = await load();
    const html = renderSpecHtml(spec);
    expect(html).toContain("Qual o nome?");
    expect(html).toContain('data-spec-option="Manda-CARU"');
    expect(html).toContain('data-spec-answer="b-nome"');
    expect(html).toContain("Já?");
    expect(html).toContain("sim");
  });

  test("com blocker aberto não há botão de aprovar; sem blocker há", async () => {
    const { renderSpecHtml } = await load();
    expect(renderSpecHtml(spec)).not.toContain("data-spec-approve");
    const livre = renderSpecHtml({ ...spec, blockers: [] });
    expect(livre).toContain("data-spec-approve");
    expect(livre).toContain("data-spec-reject");
  });

  test("SPEC já aprovada não oferece decisão", async () => {
    const { renderSpecHtml } = await load();
    const html = renderSpecHtml({ ...spec, blockers: [], status: "approved" });
    expect(html).not.toContain("data-spec-approve");
    expect(html).not.toContain("data-spec-reject");
  });

  test("sem SPEC: estado vazio com a lista para escolher", async () => {
    const { renderSpecHtml } = await load();
    const html = renderSpecHtml(null, [{ id: "SPEC-0001", title: "A", status: "draft" }, { id: "SPEC-0002", title: "B", status: "approved" }]);
    expect(html.match(/data-spec-open="/g)?.length).toBe(2);
    expect(renderSpecHtml(null, [])).toContain("Nenhuma SPEC");
  });
});

describe("specAction", () => {
  test("aprovar, pedir mudança e responder viram os verbos certos", async () => {
    const { specAction } = await load();
    expect(specAction("approve", { id: "SPEC-0001" })).toEqual({ path: "/v1/verbs/approve", body: { id: "SPEC-0001" } });
    expect(specAction("reject", { id: "SPEC-0001", reason: " falta AC " })).toEqual({ path: "/v1/verbs/reject", body: { id: "SPEC-0001", reason: "falta AC" } });
    expect(specAction("answer", { blocker_id: "b-nome", text: " Manda-CARU " })).toEqual({ path: "/v1/verbs/answer", body: { blocker_id: "b-nome", text: "Manda-CARU" } });
  });

  test("pedir mudança sem motivo e resposta vazia são recusados", async () => {
    const { specAction } = await load();
    expect(() => specAction("reject", { id: "SPEC-0001", reason: "  " })).toThrow();
    expect(() => specAction("answer", { blocker_id: "b", text: "" })).toThrow();
  });
});

describe("loadSpec", () => {
  test("POST no verbo spec com o id e monta a tela", async () => {
    const { loadSpec } = await load();
    const calls: { url: string; body: unknown }[] = [];
    const fetcher = async (url: string, init: { body: string }) => {
      calls.push({ url, body: JSON.parse(init.body) });
      return new Response(JSON.stringify(spec));
    };
    const host = { innerHTML: "" };
    await loadSpec(host, "SPEC-0001", fetcher);
    expect(calls).toEqual([{ url: "/v1/verbs/spec", body: { id: "SPEC-0001" } }]);
    expect(host.innerHTML).toContain("Qual o nome?");
  });

  test("erro da API aparece na tela", async () => {
    const { loadSpec } = await load();
    const host = { innerHTML: "" };
    await loadSpec(host, "SPEC-0099", async () => new Response(JSON.stringify({ error: "artefato não encontrado: SPEC-0099" }), { status: 500 }));
    expect(host.innerHTML).toContain("artefato não encontrado: SPEC-0099");
  });
});

describe("casca", () => {
  const html = readFileSync(join(WEB, "index.html"), "utf8");
  test("index.html tem a seção, o link e o módulo", () => {
    expect(html).toContain('id="view-spec"');
    expect(html).toContain('href="#spec"');
    expect(html).toContain("data-spec");
    expect(html).toMatch(/<script type="module" src="\/?spec\.js"><\/script>/);
  });
  test("app.js conhece a view spec e o CSS tem as regras", () => {
    expect(readFileSync(join(WEB, "app.js"), "utf8")).toContain('"spec"');
    const css = readFileSync(join(WEB, "style.css"), "utf8");
    expect(css).toContain(".spec-acs");
    expect(css).toMatch(/\.spec-action\s*\{[^}]*min-height:\s*44px/);
  });
});
