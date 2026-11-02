import { describe, expect, test } from "bun:test";
import type { Alert } from "../src/alerts";
import type { InboxItem } from "../src/board";

/**
 * RED — PLAN-0012 TASK-09 (T328): painel de alertas por severidade.
 * Contrato (TASK-09 "Interface"): renderAlerts(alerts: Alert[],
 * minSeverity?: Alert["severity"]): string em src/web/render/alerts.ts, cada
 * linha com data-severity e minSeverity mostrando a severidade escolhida e as
 * acima; renderInbox (src/web/render/inbox.ts) gera item type "alerta"
 * (data-type="alerta") para alerta high/critical. Import dinâmico p/ RED por
 * asserção.
 */

const alerts: Alert[] = [
  { id: "a1", ts: "2026-10-29T10:00:00Z", rule_id: "no_progress", severity: "critical", entity: "PLAN-0001", summary: "lane travada" },
  { id: "a2", ts: "2026-10-29T09:00:00Z", rule_id: "lane_dead", severity: "high", entity: "PLAN-0002", summary: "lane morreu" },
  { id: "a3", ts: "2026-10-29T08:00:00Z", rule_id: "stale_ready", severity: "warn", entity: "ginga", summary: "ready velho" },
  { id: "a4", ts: "2026-10-29T07:00:00Z", rule_id: "info_rule", severity: "info", entity: "x", summary: "ok" },
];

describe("renderAlerts (TASK-09)", () => {
  test("4 alertas (1 por severidade) com minSeverity high → 2 linhas", async () => {
    const mod = await import("../src/web/render/alerts").catch(() => null);
    expect(mod).not.toBeNull();
    const html = mod!.renderAlerts(alerts, "high");
    expect(html.match(/data-severity=/g)?.length).toBe(2);
    expect(html).toContain('data-severity="critical"');
    expect(html).toContain('data-severity="high"');
    expect(html).not.toContain('data-severity="warn"');
    expect(html).not.toContain('data-severity="info"');
    expect(html).toContain("lane travada");
    expect(html).toContain("no_progress");
  });

  test("sem filtro → 4 linhas", async () => {
    const mod = await import("../src/web/render/alerts").catch(() => null);
    expect(mod).not.toBeNull();
    const html = mod!.renderAlerts(alerts);
    expect(html.match(/data-severity=/g)?.length).toBe(4);
  });
});

describe("renderInbox com alertas (TASK-09)", () => {
  test("alerta critical vira item data-type=\"alerta\" no Inbox", async () => {
    const mod = await import("../src/web/render/inbox").catch(() => null);
    expect(mod).not.toBeNull();
    const items: InboxItem[] = [
      { id: "a1", type: "alerta", entity: "PLAN-0001", title: "lane travada", severity: "critical", plan: "PLAN-0001", actions: [] },
    ];
    const html = mod!.renderInbox(items);
    expect(html).toContain('data-type="alerta"');
    expect(html).toContain('data-count="1"');
  });
});
