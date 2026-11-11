import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * T917: tela Onboarding da Roda Web. Mostra o que o verbo `detect` leu e
 * cria o bundle pelo verbo `init` com `yes`.
 */
const WEB = join(import.meta.dir, "..", "web");
const load = async (): Promise<any> => import(join(WEB, "onboarding.js"));

const detect = {
  bundle: { exists: false, project_toml: false },
  detected: {
    test: "mvn test",
    provider: "rg",
    runtimes: [{ name: "pi", path: "/opt/bin/pi" }, { name: "claude", path: "/home/<u>/bin/claude" }],
    notify: true,
  },
  toml: '[commands]\ntest = "mvn test"\n',
};

describe("renderOnboardingHtml", () => {
  test("mostra teste, contexto, runtimes, notificação e o TOML proposto", async () => {
    const { renderOnboardingHtml } = await load();
    const html = renderOnboardingHtml(detect);
    expect(html).toContain("mvn test");
    expect(html).toContain("rg + git");
    expect(html.match(/data-runtime="/g)?.length).toBe(2);
    expect(html).toContain("/home/&lt;u&gt;/bin/claude");
    expect(html).not.toContain("<u>");
    expect(html).toContain("Hermes encontrado");
    expect(html).toContain("test = &quot;mvn test&quot;");
    expect(html).toContain("data-onboarding-create");
    expect(html).toContain("Criar .ginga");
  });

  test("nada detectado: diz o que falta sem inventar", async () => {
    const { renderOnboardingHtml } = await load();
    const html = renderOnboardingHtml({ ...detect, detected: { test: null, provider: "gira", runtimes: [], notify: false } });
    expect(html).toContain("Nenhum comando de teste detectado");
    expect(html).toContain("gira");
    expect(html).toContain("Nenhum runtime encontrado no PATH");
    expect(html).toContain("Hermes não encontrado");
  });

  test("project.toml já existe: avisa que nada é sobrescrito e muda o botão", async () => {
    const { renderOnboardingHtml } = await load();
    const html = renderOnboardingHtml({ ...detect, bundle: { exists: true, project_toml: true } });
    expect(html).toContain("já tem");
    expect(html).toContain("Completar o que falta");
    expect(html).not.toContain("Criar .ginga");
  });

  test("depois de criar: lista o que foi criado e o próximo passo", async () => {
    const { renderOnboardingHtml } = await load();
    const html = renderOnboardingHtml(detect, { created: ["intents/", "project.toml"] });
    expect(html).toContain("Pronto");
    expect(html).toContain("intents/");
    expect(html).toContain("project.toml");
    expect(html).toContain("+ Intent");
    const nada = renderOnboardingHtml(detect, { created: [] });
    expect(nada).toContain("Nada faltava");
  });

  test("erro aparece no lugar do assistente", async () => {
    const { renderOnboardingHtml } = await load();
    expect(renderOnboardingHtml({ error: "sem permissão" })).toContain("sem permissão");
  });
});

describe("loadOnboarding e createBundle", () => {
  test("loadOnboarding chama detect e monta a tela", async () => {
    const { loadOnboarding } = await load();
    const calls: string[] = [];
    const host = { innerHTML: "" };
    await loadOnboarding(host, async (url: string) => {
      calls.push(url);
      return new Response(JSON.stringify(detect));
    });
    expect(calls).toEqual(["/v1/verbs/detect"]);
    expect(host.innerHTML).toContain("mvn test");
  });

  test("createBundle chama init com yes e devolve o que foi criado", async () => {
    const { createBundle } = await load();
    const calls: { url: string; body: unknown }[] = [];
    const r = await createBundle(async (url: string, init: { body: string }) => {
      calls.push({ url, body: JSON.parse(init.body) });
      return new Response(JSON.stringify({ created: ["project.toml"], detected: {} }));
    });
    expect(calls).toEqual([{ url: "/v1/verbs/init", body: { yes: "true" } }]);
    expect(r.created).toEqual(["project.toml"]);
  });

  test("createBundle repassa o erro da API", async () => {
    const { createBundle } = await load();
    await expect(createBundle(async () => new Response(JSON.stringify({ error: "disco cheio" }), { status: 500 }))).rejects.toThrow("disco cheio");
  });
});

describe("casca", () => {
  const html = readFileSync(join(WEB, "index.html"), "utf8");
  test("index.html tem a seção, o link e o módulo", () => {
    expect(html).toContain('id="view-onboarding"');
    expect(html).toContain('href="#onboarding"');
    expect(html).toContain("data-onboarding");
    expect(html).toMatch(/<script type="module" src="\/?onboarding\.js"><\/script>/);
  });
  test("app.js conhece a view e o CSS tem as regras", () => {
    expect(readFileSync(join(WEB, "app.js"), "utf8")).toContain('"onboarding"');
    const css = readFileSync(join(WEB, "style.css"), "utf8");
    expect(css).toContain(".onboarding-step");
    expect(css).toMatch(/\.onboarding-create\s*\{[^}]*min-height:\s*44px/);
  });
});
