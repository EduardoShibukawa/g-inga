import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sweep } from "../src/guard/sweep";

let root: string;
const KEY = "nvapi-" + "A".repeat(48);
beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "guard-sweep-")); mkdirSync(join(root, "plans/runs"), { recursive: true });
  writeFileSync(join(root, "plans/runs/a.log"), `linha 1\nvazou ${KEY}\n`);
  mkdirSync(join(root, "limpo"), { recursive: true }); writeFileSync(join(root, "limpo/b.log"), "tudo limpo\n");
});
afterAll(() => rmSync(root, { recursive: true, force: true }));

describe("sweep", () => {
  test("acha arquivo, linha e regra, sem devolver o trecho", () => {
    const r = sweep(root);
    expect(r.hits).toEqual([{ file: "plans/runs/a.log", line: 2, rule: "key_nvapi" }]);
    expect(JSON.stringify(r)).not.toContain(KEY);
  });
  test("diretório limpo não tem hits", () => {
    expect(sweep(join(root, "limpo"))).toEqual({ files: 1, hits: [] });
  });
  test("cli sweep sai 3 com hit e imprime só arquivo:linha regra", () => {
    const p = Bun.spawnSync(["bun", join(import.meta.dir, "../src/guard/cli.ts"), "sweep", root]);
    expect(p.exitCode).toBe(3);
    const out = p.stdout.toString();
    expect(out).toContain("plans/runs/a.log:2 key_nvapi");
    expect(out).not.toContain(KEY);
  });
});
