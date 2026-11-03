// PLAN-0014 TASK-16 (tests_frozen, RED): a UI real web/metrics.js precisa exibir o
// dashboard completo — failures_by_reason com SVG + tabela irmã, cost_by por
// SPEC/PLAN/TASK, FTPR — e não só KPIs/tabela vigia/quota.
// Achado grave do judge 2026-11-03T04:05 (gate 11): renderMetrics/renderQuota de
// src/web/render não são usados pela UI real.

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");

const metrics = {
  executions: 12,
  failure_rate: 0.25,
  ftpr: { all: 0.75, "model:glm-free": 0.5, "tier:free": 0.75 },
  cost_per_verified_task_usd: 0.1,
  failures_by_reason: { done_when: 2, quota_exhausted: 1 },
  escalations: 2,
  spent_usd: 1.25,
  repeated_errors: 3,
  cost_by: {
    spec: { "SPEC-0001": 1.25 },
    plan: { "PLAN-0001": 1.25 },
    task: { "PLAN-0001/T1": 1.25 },
  },
  alert_metrics: [
    { rule_id: "no_progress", count: 3, open: 1, mttr_min: 20, cost_usd: 0.5 },
    { rule_id: "budget_cap", count: 1, open: 0, mttr_min: null, cost_usd: 0 },
  ],
};

const quotas = [
  { provider: "claude-pro", window: "5h", used_pct: 72, resets_at: "2026-11-03T18:00:00Z", source: "claude-statusline" },
  { provider: "gemini-pro", window: "subscription", used_pct: null, resets_at: null, source: "manual" },
];

function numbers(fragment: string): string[] {
  const values: string[] = [];
  for (const match of fragment.matchAll(/>([^<>]*\d[^<>]*)</g)) {
    for (const token of match[1]?.match(/-?\d+(?:\.\d+)?%?/g) ?? []) {
      values.push(String(Number(token.replace("%", ""))));
    }
  }
  return values;
}

describe("web/metrics.js — dashboard real (TASK-16)", () => {
  test("o fonte da UI real trata failures_by_reason e cost_by", () => {
    const js = readFileSync(join(ROOT, "web", "metrics.js"), "utf8");
    expect(js).toContain("failures_by_reason");
    expect(js).toContain("cost_by");
  });

  test("renderMetricsHtml existe e traz KPIs, falhas por motivo, custo por SPEC/PLAN/TASK, FTPR e vigia", async () => {
    const mod = await import("../web/metrics.js");
    expect(typeof mod.renderMetricsHtml).toBe("function");
    const html: string = mod.renderMetricsHtml(metrics);

    expect(html).toContain("data-metrics");
    for (const kpi of ["executions", "failure-rate", "ftpr", "spent-usd", "cost-per-verified-task-usd", "escalations", "repeated-errors"]) {
      expect(html).toContain(`data-kpi="${kpi}"`);
    }
    expect(html).toContain("done_when");
    expect(html).toContain("quota_exhausted");
    expect(html).toMatch(/Custo por SPEC/i);
    expect(html).toMatch(/Custo por PLAN/i);
    expect(html).toMatch(/Custo por TASK/i);
    expect(html).toContain("SPEC-0001");
    expect(html).toContain("PLAN-0001/T1");
    expect(html).toContain("1.25");
    expect(html).toContain("model:glm-free");
    expect(html).toContain("no_progress");
    expect(html).toContain("budget_cap");
  });

  test("todo SVG do dashboard tem uma tabela irmã na mesma figure com os mesmos números", async () => {
    const mod = await import("../web/metrics.js");
    const html: string = mod.renderMetricsHtml(metrics);
    const figures = [...html.matchAll(/<figure\b[\s\S]*?<\/figure>/g)];
    expect(figures.length).toBeGreaterThan(0);
    for (const figure of figures) {
      const svg = figure[0].match(/<svg\b[\s\S]*?<\/svg>/);
      expect(svg, "figure com svg").not.toBeNull();
      const table = figure[0].match(/<table\b[\s\S]*?<\/table>/);
      expect(table, "figure com table irmã").not.toBeNull();
      const svgNumbers = numbers(svg![0]);
      expect(svgNumbers.length).toBeGreaterThan(0);
      for (const value of svgNumbers) expect(table![0]).toContain(value);
    }
    expect(html).toContain('data-chart="failures"');
  });

  test("seções data-cost-by para spec, plan e task", async () => {
    const mod = await import("../web/metrics.js");
    const html: string = mod.renderMetricsHtml(metrics);
    for (const scope of ["spec", "plan", "task"]) {
      expect(html).toContain(`data-cost-by="${scope}"`);
    }
  });

  test("mountMetrics monta o dashboard completo num host (stub)", async () => {
    const mod = await import("../web/metrics.js");
    const host: any = { innerHTML: "", replaceChildren() { this.innerHTML = ""; } };
    mod.mountMetrics(host, metrics);
    const html: string = host.innerHTML;
    expect(html).toContain("data-metrics");
    expect(html).toContain("done_when");
    expect(html).toContain('data-chart="failures"');
    expect(html).toContain('data-cost-by="spec"');
    expect(html).toContain('data-cost-by="plan"');
    expect(html).toContain('data-cost-by="task"');
    expect(html).toContain("SPEC-0001");
    expect(html).toContain("no_progress");
  });

  test("renderQuotaHtml e mountQuota montam a tabela de quota por provider", async () => {
    const mod = await import("../web/metrics.js");
    expect(typeof mod.renderQuotaHtml).toBe("function");
    const html: string = mod.renderQuotaHtml(quotas);
    expect(html).toContain("data-quota");
    expect(html.match(/data-provider=/g)?.length).toBe(2);
    expect(html).toContain("claude-pro");
    expect(html).toContain("manual");

    const host: any = { innerHTML: "", replaceChildren() { this.innerHTML = ""; } };
    mod.mountQuota(host, quotas);
    expect(host.innerHTML).toContain("data-quota");
    expect(host.innerHTML).toContain("claude-pro");
  });
});
