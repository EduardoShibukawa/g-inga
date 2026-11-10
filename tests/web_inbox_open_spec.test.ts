import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * T921: o cartão do Inbox que cita uma SPEC leva à tela dela.
 */
const WEB = join(import.meta.dir, "..", "web");

describe("specOf", () => {
  test("acha a SPEC pela entity ou pelo id do item", async () => {
    const { specOf } = await import(join(WEB, "inbox.js"));
    expect(specOf({ id: "SPEC-0001", type: "aprovar", entity: "SPEC-0001" })).toBe("SPEC-0001");
    expect(specOf({ id: "b-nome", type: "blocker", entity: "SPEC-0007" })).toBe("SPEC-0007");
    expect(specOf({ id: "SPEC-0003-auth", type: "aprovar" })).toBe("SPEC-0003");
  });

  test("item de PLAN, de alerta ou vazio não tem SPEC", async () => {
    const { specOf } = await import(join(WEB, "inbox.js"));
    expect(specOf({ id: "PLAN-0002", type: "aprovar", entity: "PLAN-0002" })).toBeNull();
    expect(specOf({ id: "b1", type: "blocker", entity: "PLAN-0001" })).toBeNull();
    expect(specOf({ id: "a1", type: "alerta" })).toBeNull();
    expect(specOf(null)).toBeNull();
  });
});

describe("ligação", () => {
  test("o cartão ganha o link com data-open-spec apontando para #spec", () => {
    const js = readFileSync(join(WEB, "inbox.js"), "utf8");
    expect(js).toContain("openSpec");
    expect(js).toContain('"#spec"');
    expect(js).toContain("Abrir SPEC");
  });

  test("a tela da SPEC ouve o clique em [data-open-spec]", () => {
    expect(readFileSync(join(WEB, "spec.js"), "utf8")).toContain("[data-open-spec]");
  });

  test("o link tem alvo de toque de 44px", () => {
    expect(readFileSync(join(WEB, "style.css"), "utf8")).toMatch(/\.inbox-open\s*\{[^}]*min-height:\s*44px/);
  });
});
