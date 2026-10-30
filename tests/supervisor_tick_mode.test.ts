import { describe, expect, test } from "bun:test";

/** PLAN-0028 TASK-07: o supervisor pode trocar o operador LLM pelo tick. */
describe("supervisor em mode tick", () => {
  test("childArgv monta tick e mantém o modo operador", async () => {
    const loaded: any = await import("../src/supervisor.ts");
    expect(typeof loaded.childArgv).toBe("function");
    const childArgv = loaded.childArgv as (cfg: {
      mode: "tick" | "operador";
      repo: string;
    }) => string[];

    const tick = childArgv({ mode: "tick", repo: "ginga" });
    expect(tick).toEqual(["ginga", "tick", "--loop", "--repo", "ginga"]);

    const operador = childArgv({ mode: "operador", repo: "ginga" });
    expect(operador).toEqual(["manda", "lane", "ginga"]);

    expect(
      tick.some((arg) =>
        ["opencode", "claude", "pi"].some((bad) => arg.toLowerCase().includes(bad)),
      ),
    ).toBe(false);
  });
});
