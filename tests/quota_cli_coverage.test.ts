import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { VERBS } from "../src/verbs/registry";

const ROOT = join(import.meta.dir, "..");

describe("cobertura CLI do verbo de quota", () => {
  test("quota é verbo público com caso no contrato CLI", () => {
    expect(VERBS.map((verb) => verb.name)).toContain("quota");

    const source = readFileSync(join(ROOT, "tests", "cli_verbs.test.ts"), "utf8");
    expect(source).toContain("  quota: {");
  });
});
