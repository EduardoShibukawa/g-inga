import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * T916: bloco "Modelos" da tela Modelos e quota. Usa só o que os verbos
 * `cost` e `metrics` já devolvem.
 */
const WEB = join(import.meta.dir, "..", "web");
const load = async (): Promise<any> => import(join(WEB, "models.js"));

const cost = { total_usd: 1.8, by_day: {}, by_model: { "glm-5": 1.5, "<x>": 0.3 } };
const metrics = { ftpr: { all: 0.64, "model:glm-5": 0.5, "model:qwen-3": 0.9, "tier:fast": 0.7 } };

describe("renderModelsHtml", () => {
  test("gasto por modelo, do maior para o menor, com o total", async () => {
    const { renderModelsHtml } = await load();
    const html = renderModelsHtml({ cost, metrics });
    expect(html).toContain("US$ 1.80");
    expect(html.indexOf("glm-5")).toBeLessThan(html.indexOf("&lt;x&gt;"));
    expect(html).toContain("US$ 1.50");
    expect(html).not.toContain("<x>");
  });

  test("FTPR só dos modelos, do maior para o menor, com barra proporcional", async () => {
    const { renderModelsHtml } = await load();
    const html = renderModelsHtml({ cost, metrics });
    expect(html.match(/data-ftpr-model="/g)?.length).toBe(2);
    expect(html.indexOf('data-ftpr-model="qwen-3"')).toBeLessThan(html.indexOf('data-ftpr-model="glm-5"'));
    expect(html).toContain("90%");
    expect(html).toContain("50%");
    expect(html).toMatch(/data-ftpr-model="qwen-3"[\s\S]*?style="width: 90%"/);
    expect(html).not.toContain("tier:fast");
  });

  test("sem dados: cada bloco diz que não há medição", async () => {
    const { renderModelsHtml } = await load();
    const html = renderModelsHtml({ cost: { total_usd: 0, by_model: {} }, metrics: { ftpr: {} } });
    expect(html).toContain("Nenhum custo medido");
    expect(html).toContain("Nenhuma execução medida");
    expect(renderModelsHtml({})).toContain("Nenhum custo medido");
  });

  test("erro vira aviso no lugar dos blocos", async () => {
    const { renderModelsHtml } = await load();
    expect(renderModelsHtml({ error: "fora do ar" })).toContain("fora do ar");
  });
});

describe("loadModels", () => {
  test("chama cost e metrics e monta no host", async () => {
    const { loadModels } = await load();
    const calls: string[] = [];
    const fetcher = async (url: string) => {
      calls.push(url);
      return new Response(JSON.stringify(url.endsWith("/cost") ? cost : metrics));
    };
    const host = { innerHTML: "" };
    await loadModels(host, fetcher);
    expect(calls.sort()).toEqual(["/v1/verbs/cost", "/v1/verbs/metrics"]);
    expect(host.innerHTML).toContain("qwen-3");
  });

  test("API fora do ar: aviso no host", async () => {
    const { loadModels } = await load();
    const host = { innerHTML: "" };
    await loadModels(host, async () => new Response(JSON.stringify({ error: "sem state.db" }), { status: 500 }));
    expect(host.innerHTML).toContain("sem state.db");
  });
});

describe("casca", () => {
  const html = readFileSync(join(WEB, "index.html"), "utf8");
  test("a view quota chama Modelos e quota e tem o host dos modelos", () => {
    expect(html).toContain("Modelos e quota");
    expect(html).toMatch(/<a href="#quota"[^>]*>\s*<span>Modelos<\/span>/);
    expect(html).toContain("data-models");
    expect(html).toMatch(/<script type="module" src="\/?models\.js"><\/script>/);
  });
  test("style.css tem a barra de FTPR", () => {
    expect(readFileSync(join(WEB, "style.css"), "utf8")).toContain(".ftpr-bar");
  });
});
