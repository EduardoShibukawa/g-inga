import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { readFileSync } from "node:fs";

/**
 * RED — PLAN-0016 TASK-06: relatório e decisão pelos critérios pré-registrados.
 * Contrato (PLAN.md "Interfaces" + TASK-06): bench/code-mode/report.ts exporta
 * decide(trials) → [{h, verdict, evidence}] para H1,H2,H3,H4,H5,H7 e
 * renderReport(trials) → markdown com tabela por modo × modelo (reward médio, pass^k,
 * turnos, tokens, custo, latência; trials infra fora das médias).
 * Fixture: tests/fixtures/code-mode/results.jsonl (números escolhidos para cada veredito;
 * inclui trials infra com tokens absurdos — se forem contados nas médias, H1 quebra).
 */

const RESULTS = join(import.meta.dir, "..", "fixtures", "code-mode", "results.jsonl");

describe("PLAN-0016 TASK-06: decide pelos critérios pré-registrados", () => {
  test("decide devolve exatamente 6 vereditos (H1..H5,H7) com os vereditos esperados do fixture", async () => {
    const mod = await import("../../bench/code-mode/report").catch(() => null);
    expect(mod).not.toBeNull();
    const trials = readFileSync(RESULTS, "utf8").trim().split("\n").map((l) => JSON.parse(l));
    const d = mod!.decide(trials);
    expect(d.length).toBe(6);
    const byH = Object.fromEntries(d.map((x: any) => [x.h, x]));
    // M: 8/10, tokens 10000 | X2: 9/10, tokens 6000 → 6000 ≤ 0,7×10000 e 9 ≥ 8−1 → adota H1
    expect(byH.H1.verdict).toBe("adotar");
    expect(byH.H2.verdict).toBe("informativo"); // H2 é sempre informativo
    // |C 9 − X2 9| = 0 ≤ 1 task → adota "não criar execute"
    expect(byH.H3.verdict).toBe("adotar");
    // menor modelo com reward ≥ 8/10 em X2 é o m-a (9/10) → informativo com a evidência
    expect(byH.H4.verdict).toBe("informativo");
    expect(String(byH.H4.evidence)).toContain("m-a");
    // Oracle 10/10 (modo O todo reward 1) → adota H5
    expect(byH.H5.verdict).toBe("adotar");
    // X2 min (5000) ≤ 0,85×6000 com o mesmo reward (9/10) → adota H7
    expect(byH.H7.verdict).toBe("adotar");
  });

  test("renderReport gera tabela markdown por modo × modelo com reward e tokens", async () => {
    const mod = await import("../../bench/code-mode/report").catch(() => null);
    const trials = readFileSync(RESULTS, "utf8").trim().split("\n").map((l) => JSON.parse(l));
    const md = mod!.renderReport(trials);
    expect(typeof md).toBe("string");
    expect(md).toContain("|"); // tabela markdown
    expect(md).toContain("reward");
    expect(md).toContain("tokens_in");
    expect(md).toContain("pass^k");
    expect(md).toContain("M");
    expect(md).toContain("X2");
  });
});
