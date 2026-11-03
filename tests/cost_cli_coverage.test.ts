import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { VERBS } from "../src/verbs/registry";

const ROOT = join(import.meta.dir, "..");

describe("cobertura CLI dos verbos de custo", () => {
  test("cost sync e cost são verbos públicos com caso no contrato CLI", () => {
    const names = VERBS.map((verb) => verb.name);
    expect(names).toContain("cost sync");
    expect(names).toContain("cost");

    const source = readFileSync(join(ROOT, "tests", "cli_verbs.test.ts"), "utf8");
    for (const name of ["cost sync", "cost"]) {
      const key = name.includes(" ") ? `"${name}"` : name;
      expect(source).toContain(`  ${key}: {`);
    }
  });
});
