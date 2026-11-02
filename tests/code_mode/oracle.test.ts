import { describe, expect, test } from "bun:test";
import { join } from "node:path";

/**
 * RED — PLAN-0016 TASK-01 (H5): as 10 tasks do code mode têm Oracle 10/10 no
 * snapshot sintético e verifier exato que aceita solução alternativa equivalente.
 * Contrato (PLAN.md "Interfaces"): bench/code-mode/tasks.ts exporta CMTask,
 * TASKS (exatamente 10, ids t01..t10), oracle(task, snapshot) e
 * verify(task, answer, snapshot): 0|1. Import dinâmico p/ RED por asserção.
 *
 * Fixture: tests/fixtures/code-mode/snapshot/ (só dado sintético).
 */

const SNAP = join(import.meta.dir, "..", "fixtures", "code-mode", "snapshot");

const EXPECTED: Record<string, unknown> = {
  t01: "approved", // status do PLAN-0001-alpha
  t02: 2, // nº de TASKs do PLAN-0001-alpha
  t03: { plan: "PLAN-0001-alpha", task: "TASK-01", touch: ["src/a.ts"] }, // touch da TASK que passou na tentativa 1 com pi:m1
  t04: { "pi:m1": 0.15, "pi:m2": 0.2 }, // custo pago por modelo (linhas "tentativa paga N: US$x" dos log.md)
  t05: {
    "pi:m1": { attempts: 1, pass: 1, rate: 1 },
    "pi:m2": { attempts: 3, pass: 2, rate: 0.67 },
  }, // tentativas e taxa de pass por modelo (2 casas)
  t06: 1, // runs/*.log com "Free usage limit"
  t07: 3, // total de step_finish nos runs/*.jsonl
  t08: ["PLAN-0003-gamma", "PLAN-0004-delta"], // PLANs que dependen (direta/trans.) de PLAN draft
  t09: [{ plan: "PLAN-0002-beta", task: "TASK-09", cost: 0 }], // tentativas pagas com custo US$ 0 (trap)
  t10: ["PLAN-0002-beta/TASK-09"], // TASKs citadas em log.md sem TASK-*.md (trap)
};

// Respostas alternativas equivalentes (outra ordem, string numérica, 2 casas) → reward 1
const ALT: Record<string, unknown> = {
  t01: "approved",
  t02: "2",
  t03: { touch: ["src/a.ts"], task: "TASK-01", plan: "PLAN-0001-alpha" },
  t04: { "pi:m2": 0.2, "pi:m1": 0.15 },
  t05: {
    "pi:m2": { rate: 2 / 3, pass: 2, attempts: 3 },
    "pi:m1": { attempts: 1, pass: 1, rate: 1.0 },
  },
  t06: "1",
  t07: 3.0,
  t08: ["PLAN-0004-delta", "PLAN-0003-gamma"],
  t09: [{ cost: "0", task: "TASK-09", plan: "PLAN-0002-beta" }],
  t10: ["PLAN-0002-beta/TASK-09"],
};

// Respostas erradas → reward 0
const WRONG: Record<string, unknown> = {
  t01: "draft",
  t02: 3,
  t03: { plan: "PLAN-0001-alpha", task: "TASK-01", touch: ["src/b.ts"] },
  t04: { "pi:m1": 0.16, "pi:m2": 0.2 },
  t05: { "pi:m1": { attempts: 1, pass: 1, rate: 1 }, "pi:m2": { attempts: 3, pass: 3, rate: 1 } },
  t06: 2,
  t07: 2,
  t08: ["PLAN-0003-gamma"],
  t09: [],
  t10: [],
};

describe("PLAN-0016 TASK-01: TASKS, Oracle 10/10 e verifier exato", () => {
  test("módulo existe e TASKS tem exatamente 10 tasks com schema", async () => {
    const mod = await import("../../bench/code-mode/tasks").catch(() => null);
    expect(mod).not.toBeNull();
    expect(mod!.TASKS.length).toBe(10);
    for (const t of mod!.TASKS) {
      expect(typeof t.id).toBe("string");
      expect(["direta", "juncao", "agregacao", "multihop"]).toContain(t.level);
      expect(typeof t.question).toBe("string");
      expect(t.question.length).toBeGreaterThan(10);
      expect(typeof t.answer_schema).toBe("object");
      expect(typeof t.trap).toBe("boolean");
      expect(typeof t.heavy).toBe("boolean");
    }
    expect(mod!.TASKS.map((t) => t.id).sort()).toEqual(Object.keys(EXPECTED).sort());
    expect(mod!.TASKS.find((t) => t.id === "t09")!.trap).toBe(true);
    expect(mod!.TASKS.find((t) => t.id === "t10")!.trap).toBe(true);
    expect(mod!.TASKS.find((t) => t.id === "t06")!.heavy).toBe(true);
    expect(mod!.TASKS.find((t) => t.id === "t07")!.heavy).toBe(true);
  });

  test("oracle dá 10/10 no snapshot sintético (respostas esperadas)", async () => {
    const mod = await import("../../bench/code-mode/tasks").catch(() => null);
    expect(mod).not.toBeNull();
    for (const t of mod!.TASKS) {
      expect(mod!.oracle(t, SNAP)).toEqual(EXPECTED[t.id]);
    }
  });

  test("verify aceita alternativa equivalente (reward 1) e rejeita errada (reward 0)", async () => {
    const mod = await import("../../bench/code-mode/tasks").catch(() => null);
    expect(mod).not.toBeNull();
    for (const t of mod!.TASKS) {
      expect(mod!.verify(t, ALT[t.id], SNAP)).toBe(1);
      expect(mod!.verify(t, WRONG[t.id], SNAP)).toBe(0);
    }
  });
});
