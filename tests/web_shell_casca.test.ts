import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

/**
 * RED — PLAN-0012 follow-up do judge 2026-11-01 (TASK-02 reprovada, T329): a
 * casca real em web/ não pode ser vazia (index.html/app.js/style.css com 1
 * byte; o web_shell.test.ts antigo passa só com fixtures temporárias).
 * Contrato (TASK-02 "Fazer"/"Interface"): web/index.html real com
 * <nav data-view="inbox|board|plan"> e as três telas; app.js assina /v1/events
 * (SSE) e chama /v1/verbs/*; sidebar no desktop, abas abaixo de 640px; tema
 * claro/escuro. Este teste lê os arquivos REAIS do repo.
 */

describe("casca real da Roda Web (web/) — T329", () => {
  test("web/index.html real: nav data-view, 3 telas, app.js, style.css e os módulos das telas", () => {
    const html = read("web/index.html");
    expect(html.length).toBeGreaterThan(200);
    expect(html).toContain('nav data-view="inbox|board|plan"');
    expect(html).toContain('data-view="inbox"');
    expect(html).toContain('data-view="board"');
    expect(html).toContain('data-view="plan"');
    expect(html).toMatch(/src="[^"]*app\.js"/);
    expect(html).toMatch(/href="[^"]*style\.css"/);
    for (const view of ["inbox.js", "board.js", "plan.js", "alerts.js"]) {
      expect(html).toContain(view);
    }
  });

  test("web/app.js real: SSE /v1/events, verbos /v1/verbs/, troca de view e tema", () => {
    const js = read("web/app.js");
    expect(js.length).toBeGreaterThan(200);
    expect(js).toContain("/v1/events");
    expect(js).toContain("/v1/verbs/");
    expect(js).toMatch(/EventSource/);
    expect(js).toContain("data-view");
    expect(js).toMatch(/data-theme/);
  });

  test("web/style.css real: sidebar, abas abaixo de 640px e tema claro/escuro", () => {
    const css = read("web/style.css");
    expect(css.length).toBeGreaterThan(200);
    expect(css).toMatch(/sidebar/i);
    expect(css).toMatch(/@media[^{]*640\s*px/);
    expect(css).toContain("data-theme");
    expect(css).toMatch(/dark/);
  });
});
