import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

/**
 * RED — PLAN-0012 follow-up do judge 2026-11-01T221449 (TASK-09, grave): a tela
 * de alertas não existe de ponta a ponta na Roda Web.
 * - web/index.html tem a 4ª view: link de nav data-view="alerts" e a seção
 *   view-alerts com o painel [data-alerts] / lista [data-alerts-list].
 * - web/app.js inclui "alerts" nas VIEWS (troca de view funciona).
 * - web/alerts.js monta o painel: busca POST /v1/verbs/alerts (com sev da URL),
 *   renderiza as linhas com data-severity e atualiza [data-count]; re-lê no
 *   evento SSE ginga:event. Mantém os helpers de filtro (minSeverityFromSearch,
 *   filterBySeverity).
 */

describe("web — painel de alertas montado (T334)", () => {
  test("web/index.html tem a view de alertas (nav + seção + painel)", () => {
    const html = read("web/index.html");
    expect(html).toContain('data-view="alerts"');
    expect(html).toContain("view-alerts");
    expect(html).toContain("data-alerts");
    expect(html).toContain("data-alerts-list");
  });

  test("web/app.js inclui alerts nas VIEWS", () => {
    const js = read("web/app.js");
    expect(js).toContain('"alerts"');
  });

  test("web/alerts.js busca /v1/verbs/alerts, monta as linhas e usa SSE", () => {
    const js = read("web/alerts.js");
    expect(js.length).toBeGreaterThan(100);
    expect(js).toContain("/v1/verbs/alerts");
    expect(js).toContain("data-alerts-list");
    expect(js).toContain("data-severity");
    expect(js).toContain("ginga:event");
  });

  test("helpers de filtro continuam exportados e corretos", async () => {
    const mod = await import("../web/alerts.js").catch(() => null);
    expect(mod).not.toBeNull();
    const alerts = [
      { id: "a1", severity: "critical" },
      { id: "a2", severity: "high" },
      { id: "a3", severity: "warn" },
      { id: "a4", severity: "info" },
    ] as any[];
    expect(mod!.filterBySeverity(alerts, "high").map((a) => a.id)).toEqual(["a1", "a2"]);
    expect(mod!.filterBySeverity(alerts, undefined).length).toBe(4);
    expect(mod!.minSeverityFromSearch("?sev=critical")).toBe("critical");
    expect(mod!.minSeverityFromSearch("?sev=zzz")).toBeUndefined();
  });
});
