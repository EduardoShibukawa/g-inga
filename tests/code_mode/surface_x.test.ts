import { describe, expect, test } from "bun:test";

/**
 * RED — PLAN-0016 TASK-05: superfície X (search_tools + execute no bwrap, saída truncada).
 * Contrato (PLAN.md "Interfaces" + TASK-05): bench/code-mode/surfaces/x.ts exporta
 * bwrapArgv(snapshot, script, minimal), truncate(out, max=8000) e
 * execute(script, o: { snapshot, minimal, run }) — run injetado, sem bwrap real no teste.
 * Sem rede (--unshare-net); minimal monta só /usr + snapshot read-only + tmp;
 * FS inteiro monta / read-only.
 */

describe("PLAN-0016 TASK-05: superfície X", () => {
  test("bwrapArgv exato nos dois modos (contém --unshare-net e --ro-bind <snapshot>)", async () => {
    const mod = await import("../../bench/code-mode/surfaces/x").catch(() => null);
    expect(mod).not.toBeNull();
    expect(mod!.bwrapArgv("/snap", "/tmp/s.ts", true)).toEqual([
      "bwrap", "--unshare-net", "--dev", "/dev", "--proc", "/proc", "--tmpfs", "/tmp",
      "--ro-bind", "/usr", "/usr",
      "--ro-bind", "/snap", "/snap",
      "--ro-bind", "/tmp/s.ts", "/tmp/s.ts",
      "--", "bun", "/tmp/s.ts",
    ]);
    expect(mod!.bwrapArgv("/snap", "/tmp/s.ts", false)).toEqual([
      "bwrap", "--unshare-net", "--dev", "/dev", "--proc", "/proc", "--tmpfs", "/tmp",
      "--ro-bind", "/", "/",
      "--ro-bind", "/snap", "/snap",
      "--ro-bind", "/tmp/s.ts", "/tmp/s.ts",
      "--", "bun", "/tmp/s.ts",
    ]);
  });

  test("truncate: 10000 chars → 8000 + marcador; texto curto passa intacto", async () => {
    const mod = await import("../../bench/code-mode/surfaces/x").catch(() => null);
    const t = mod!.truncate("a".repeat(10000));
    expect(t.startsWith("a".repeat(8000))).toBe(true);
    expect(t).toContain("truncated");
    expect(t.length).toBeGreaterThan(8000);
    expect(mod!.truncate("oi")).toBe("oi");
  });

  test("execute roda o argv do bwrap via run injetado e devolve a saída truncada", async () => {
    const mod = await import("../../bench/code-mode/surfaces/x").catch(() => null);
    let captured: string[] = [];
    const out = await mod!.execute("console.log(1)", {
      snapshot: "/snap",
      minimal: true,
      run: async (argv) => { captured = argv; return "x".repeat(10000); },
    });
    const joined = captured.join(" ");
    expect(joined).toContain("--unshare-net");
    expect(joined).toContain("--ro-bind /snap /snap");
    expect(joined).toContain("bun");
    expect(out.startsWith("x".repeat(8000))).toBe(true);
    expect(out).toContain("truncated");
  });
});
