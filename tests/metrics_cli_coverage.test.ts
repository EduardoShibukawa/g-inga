import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { VERBS } from "../src/verbs/registry";

const ROOT = join(import.meta.dir, "..");

describe("cobertura CLI do verbo metrics", () => {
  test("metrics é verbo público com caso no contrato CLI", () => {
    const names = VERBS.map((verb) => verb.name);
    expect(names).toContain("metrics");

    const source = readFileSync(join(ROOT, "tests", "cli_verbs.test.ts"), "utf8");
    expect(source).toContain("  metrics: {");
  });
});
