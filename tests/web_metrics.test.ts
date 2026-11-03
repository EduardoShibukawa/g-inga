// PLAN-0014 TASK-05 (tests_frozen): telas puras de Métricas e Quota + cliente HTTP.

import { describe, expect, test } from "bun:test";
import type { Metrics } from "../src/metrics";
import type { RuleMetrics } from "../src/metrics_alerts";
import type { Quota } from "../src/quota";

const metrics: Metrics = {
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
};

const rules: RuleMetrics[] = [
  { rule_id: "no_progress", count: 3, open: 1, mttr_min: 20, cost_usd: 0.5 },
  { rule_id: "budget_cap", count: 1, open: 0, mttr_min: null, cost_usd: 0 },
];

const quotas: Quota[] = [
  { provider: "claude-pro", window: "5h", used_pct: 72, resets_at: "2026-11-03T18:00:00Z", source: "claude-statusline" },
  { provider: "chatgpt-go", window: "30d", used_pct: 1, resets_at: "2026-11-30T00:00:00Z", source: "codex-rollout" },
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

function kpi(html: string, name: string): string {
  const marker = `data-kpi="${name}"`;
  const at = html.indexOf(marker);
  expect(at).toBeGreaterThanOrEqual(0);
  const open = html.lastIndexOf("<", at);
  const close = html.indexOf("</", html.indexOf(">", at));
  return html.slice(open, close + 2);
}

describe("renderMetrics (PLAN-0014 TASK-05)", () => {
  test("mostra todos os KPIs e as tabelas de falhas, custo e vigia", async () => {
    const mod = await import("../src/web/render/metrics").catch(() => null);
    expect(mod).not.toBeNull();
    const html = mod!.renderMetrics(metrics, rules);

    expect(html).toContain("data-metrics");
    expect(numbers(kpi(html, "executions"))).toContain("12");
    expect(numbers(kpi(html, "failure-rate")).some((n) => n === "25" || n === "0.25")).toBe(true);
    expect(numbers(kpi(html, "ftpr")).some((n) => n === "75" || n === "0.75")).toBe(true);
    expect(numbers(kpi(html, "spent-usd"))).toContain("1.25");
    expect(numbers(kpi(html, "cost-per-verified-task-usd"))).toContain("0.1");
    expect(numbers(kpi(html, "escalations"))).toContain("2");
    expect(numbers(kpi(html, "repeated-errors"))).toContain("3");

    expect(html).toContain("done_when");
    expect(html).toContain("quota_exhausted");
    expect(html).toMatch(/Custo por SPEC/i);
    expect(html).toMatch(/Custo por PLAN/i);
    expect(html).toMatch(/Custo por TASK/i);
    expect(html).toContain("SPEC-0001");
    expect(html).toContain("PLAN-0001/T1");
    expect(html).toContain("no_progress");
    expect(html).toContain("20");
    expect(html).toContain("0.5");
  });

  test("todo SVG tem uma tabela irmã com os mesmos números", async () => {
    const mod = await import("../src/web/render/metrics").catch(() => null);
    expect(mod).not.toBeNull();
    const html = mod!.renderMetrics(metrics, rules);
    const svgs = [...html.matchAll(/<svg\b[\s\S]*?<\/svg>/g)];

    expect(svgs.length).toBeGreaterThan(0);
    for (const svg of svgs) {
      const tail = html.slice((svg.index ?? 0) + svg[0].length);
      const table = tail.match(/<table\b[\s\S]*?<\/table>/);
      expect(table).not.toBeNull();
      const figureEnd = tail.indexOf("</figure>");
      if (figureEnd >= 0) expect(table!.index).toBeLessThan(figureEnd);

      const svgNumbers = numbers(svg[0]);
      expect(svgNumbers.length).toBeGreaterThan(0);
      for (const value of svgNumbers) expect(table![0]).toContain(value);
    }
  });
});

describe("renderQuota (PLAN-0014 TASK-05)", () => {
  test("uma linha por provider com janela, uso, reseta e fonte", async () => {
    const mod = await import("../src/web/render/quota").catch(() => null);
    expect(mod).not.toBeNull();
    const html = mod!.renderQuota(quotas);

    expect(html).toContain("data-quota");
    expect(html.match(/data-provider=/g)?.length).toBe(3);
    expect(html).toContain("claude-pro");
    expect(html).toContain("chatgpt-go");
    expect(html).toContain("gemini-pro");
    expect(html).toContain("5h");
    expect(html).toContain("30d");
    expect(html).toContain("72");
    expect(html).toContain("2026-11-03T18:00:00Z");
    expect(html).toContain("claude-statusline");
    expect(html).toContain("manual");
  });
});

describe("web/metrics.js (PLAN-0014 TASK-05)", () => {
  test("busca metrics e quota nos verbos da API", async () => {
    const mod = await import("../web/metrics.js").catch(() => null);
    expect(mod).not.toBeNull();
    const calls: Array<{ path: string; init: any }> = [];
    const fetcher = (async (path: string, init: any) => {
      calls.push({ path, init });
      const body = path.endsWith("/quota") ? quotas : metrics;
      return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
    }) as any;

    const gotMetrics = await mod!.fetchMetrics(fetcher);
    const gotQuota = await mod!.fetchQuota(fetcher);

    expect(calls.map((call) => call.path)).toEqual(["/v1/verbs/metrics", "/v1/verbs/quota"]);
    expect(calls.every((call) => call.init.method === "POST")).toBe(true);
    expect(gotMetrics).toEqual(metrics);
    expect(gotQuota).toEqual(quotas);
  });
});
