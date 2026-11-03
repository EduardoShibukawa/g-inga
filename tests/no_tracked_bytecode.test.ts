import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";

/**
 * RED — PLAN-0035: nenhum bytecode Python pode estar rastreado. Um .pyc no git
 * suja a main a cada teste do plugin Hermes e faz o merge-gate sair com 2.
 */
test("git ls-files não lista .pyc nem __pycache__", () => {
  const r = spawnSync("git", ["ls-files"], { cwd: import.meta.dir + "/..", encoding: "utf8" });
  const bad = r.stdout.split("\n").filter((f) => /(^|\/)__pycache__\/|\.pyc$/.test(f));
  expect(bad).toEqual([]);
});
