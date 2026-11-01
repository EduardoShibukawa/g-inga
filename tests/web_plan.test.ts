import { describe, expect, test } from "bun:test";

/**
 * RED — PLAN-0012 TASK-05 (T327): detalhe do PLAN (render puro).
 * Contrato (TASK-05 "Interface"): renderPlan(p: { id, status, spent_usd,
 * cap_usd, tasks: { id, status, attempts: { model, cost_usd, pass }[] }[],
 * log }): string em src/web/render/plan.ts; botões
 * data-verb="retry|escalate|pause|cancel". Import dinâmico p/ RED por asserção.
 */

const p = {
  id: "PLAN-0001",
  status: "executando",
  spent_usd: 0.42,
  cap_usd: 2,
  tasks: [
    { id: "TASK-01", status: "pass", attempts: [{ model: "glm-free", cost_usd: 0, pass: true }] },
    { id: "TASK-02", status: "open", attempts: [{ model: "qwen-free", cost_usd: 0.02, pass: false }] },
  ],
  log: "# Log — PLAN-0001\n- rodada 1 ok\n",
};

describe("renderPlan (TASK-05)", () => {
  test("cabeçalho com gasto/teto, TASKs com tentativas e botões de ação", async () => {
    const mod = await import("../src/web/render/plan").catch(() => null);
    expect(mod).not.toBeNull();
    const html = mod!.renderPlan(p);
    expect(html).toContain("PLAN-0001");
    expect(html).toContain("0.42");
    expect(html).toContain("TASK-01");
    expect(html).toContain("TASK-02");
    expect(html).toContain("glm-free");
    expect(html).toContain('data-verb="retry"');
    expect(html).toContain('data-verb="escalate"');
    expect(html).toContain('data-verb="pause"');
    expect(html).toContain('data-verb="cancel"');
  });

  test("log.md do PLAN aparece embaixo", async () => {
    const mod = await import("../src/web/render/plan").catch(() => null);
    expect(mod).not.toBeNull();
    const html = mod!.renderPlan(p);
    expect(html).toContain("rodada 1 ok");
  });
});
