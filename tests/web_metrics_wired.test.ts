// PLAN-0014 TASK-13 (tests_frozen): ligar Métricas/Quota na casca real da Roda Web.
// Achado grave do judge 2026-11-03T00:38 (gate 11): as telas existem (TASK-05/T361)
// mas web/app.js e web/index.html não as ligam, então o dashboard não é observável.

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

const sectionOf = (html: string, view: string): string => {
  const m = html.match(new RegExp(`<section[^>]*data-view="${view}"[^>]*>([\\s\\S]*?)</section>`));
  expect(m, `section com data-view="${view}"`).not.toBeNull();
  return m![1];
};

describe("TASK-13: Métricas/Quota ligadas na casca real (web/)", () => {
  test("web/app.js: VIEWS inclui metrics e quota", () => {
    const js = read("web/app.js");
    const m = js.match(/VIEWS\s*=\s*Object\.freeze\(\s*\[([^\]]*)\]/);
    expect(m, "VIEWS em web/app.js").not.toBeNull();
    const views = m![1].split(",").map((v) => v.trim().replace(/^["']|["']$/g, ""));
    expect(views).toContain("metrics");
    expect(views).toContain("quota");
  });

  test("web/index.html: script /metrics.js e links de nav para metrics e quota", () => {
    const html = read("web/index.html");
    expect(html).toMatch(/<script[^>]*src="[^"]*\/metrics\.js"/);
    const nav = html.match(/<nav[\s\S]*?<\/nav>/);
    expect(nav, "nav").not.toBeNull();
    expect(nav![0]).toContain('href="#metrics"');
    expect(nav![0]).toContain('data-view="metrics"');
    expect(nav![0]).toContain('href="#quota"');
    expect(nav![0]).toContain('data-view="quota"');
  });

  test("web/index.html: seções view-metrics/view-quota com os hosts [data-metrics]/[data-quota], ocultas por padrão", () => {
    const html = read("web/index.html");
    for (const view of ["metrics", "quota"]) {
      const open = html.match(new RegExp(`<section[^>]*id="view-${view}"[^>]*>`));
      expect(open, `section#view-${view}`).not.toBeNull();
      expect(open![0]).toContain("hidden");
    }
    expect(sectionOf(html, "metrics")).toContain("data-metrics");
    expect(sectionOf(html, "quota")).toContain("data-quota");
  });
});
