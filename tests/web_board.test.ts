import { describe, expect, test } from "bun:test";
import type { Board, Column } from "../src/board";

/**
 * RED — PLAN-0012 TASK-04 (T326): tela Quadro (render puro).
 * Contrato (TASK-04 "Interface"): renderBoard(b: Board, f?: { repo?: string;
 * track?: string }): string em src/web/render/board.ts; marcas ⚑ (blocker),
 * ✓? (aguardando aprovação), ⟳ (rodando) e progresso n/m; filtro por repo
 * esconde o card de outro repo. Import dinâmico p/ RED por asserção.
 */

const emptyCols = (): Record<Column, Board["columns"][Column]> => ({
  INTENT: [], SPEC: [], PLAN: [], EXECUTANDO: [], VERIFICANDO: [], FEITO: [],
});

const board: Board = {
  columns: {
    ...emptyCols(),
    SPEC: [{ id: "SPEC-0001", kind: "spec", title: "Auth", status: "draft", tasks: { total: 0, pass: 0, running: 0 }, blocked: false }],
    EXECUTANDO: [{ id: "PLAN-0001", kind: "plan", title: "Roda Web", status: "executando", repo: "ginga", track: "feature", tasks: { total: 4, pass: 2, running: 1 }, blocked: true }],
    VERIFICANDO: [{ id: "PLAN-0002", kind: "plan", title: "Métricas", status: "verificando", repo: "manda", track: "pequena", tasks: { total: 3, pass: 3, running: 0 }, blocked: false }],
  },
  inbox: [],
};

describe("renderBoard (TASK-04)", () => {
  test("marcas ⚑ ⟳ ✓? e progresso n/m nos cards", async () => {
    const mod = await import("../src/web/render/board").catch(() => null);
    expect(mod).not.toBeNull();
    const html = mod!.renderBoard(board);
    expect(html).toContain("⚑");
    expect(html).toContain("⟳");
    expect(html).toContain("✓?");
    expect(html).toContain("2/4");
    expect(html).toContain("3/3");
  });

  test("filtro por repo esconde o card de outro repo", async () => {
    const mod = await import("../src/web/render/board").catch(() => null);
    expect(mod).not.toBeNull();
    const html = mod!.renderBoard(board, { repo: "ginga" });
    expect(html).toContain("PLAN-0001");
    expect(html).not.toContain("PLAN-0002");
  });

  test("filtro por trilha esconde o card de outra trilha", async () => {
    const mod = await import("../src/web/render/board").catch(() => null);
    expect(mod).not.toBeNull();
    const html = mod!.renderBoard(board, { track: "feature" });
    expect(html).toContain("PLAN-0001");
    expect(html).not.toContain("PLAN-0002");
  });
});
