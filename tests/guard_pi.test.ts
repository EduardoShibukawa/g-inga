import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import guardExt from "../contrib/guard/pi";

// Pi falso: guarda os handlers registrados com pi.on(evento, fn).
const fakePi = () => { const h: Record<string, Function> = {}; return { on: (e: string, f: Function) => { h[e] = f; }, h }; };
let root: string, cwd: string, home: string, prevCwd: string;
const KEY = "nvapi-" + "A".repeat(48);

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "guard-pi-")); cwd = join(root, "work"); home = join(root, "home");
  mkdirSync(cwd, { recursive: true }); mkdirSync(join(home, ".pi/agent"), { recursive: true });
  writeFileSync(join(cwd, ".env"), "FAKE=1\n"); writeFileSync(join(cwd, "README.md"), "oi\n"); writeFileSync(join(home, ".pi/agent/auth.json"), "{}");
  prevCwd = process.cwd(); process.chdir(cwd);
});
afterAll(() => { process.chdir(prevCwd); rmSync(root, { recursive: true, force: true }); });

const lane = () => ({ GINGA_GUARD_LANE: "lane-test", HOME: home });

describe("extensão Pi", () => {
  test("fora de lane não registra handler", () => {
    const pi = fakePi(); guardExt(pi, { HOME: home });
    expect(Object.keys(pi.h)).toHaveLength(0);
  });
  test("cat .env é barrado", async () => {
    const pi = fakePi(); guardExt(pi, lane());
    const r = await pi.h.tool_call({ toolName: "bash", input: { command: "cat .env" } });
    expect(r).toMatchObject({ block: true });
    expect(r.reason).toContain("guard-segredos");
    expect(r.reason).not.toContain("guard_error");
  });
  test("cat ~/.pi/agent/auth.json é barrado", async () => {
    const pi = fakePi(); guardExt(pi, lane());
    const r = await pi.h.tool_call({ toolName: "bash", input: { command: "cat ~/.pi/agent/auth.json" } });
    expect(r).toMatchObject({ block: true });
    expect(r.reason).not.toContain("guard_error");
  });
  test("read de .env é barrado", async () => {
    const pi = fakePi(); guardExt(pi, lane());
    expect(await pi.h.tool_call({ toolName: "read", input: { path: ".env" } })).toMatchObject({ block: true });
  });
  test("cat README.md passa (retorna undefined)", async () => {
    const pi = fakePi(); guardExt(pi, lane());
    expect(await pi.h.tool_call({ toolName: "bash", input: { command: "cat README.md" } })).toBeUndefined();
  });
  test("tool_result redige chave no texto", async () => {
    const pi = fakePi(); guardExt(pi, lane());
    const r = await pi.h.tool_result({ toolName: "bash", content: [{ type: "text", text: `saída ${KEY}` }] });
    expect(JSON.stringify(r)).not.toContain(KEY);
  });
  test("tool_result limpo retorna undefined", async () => {
    const pi = fakePi(); guardExt(pi, lane());
    expect(await pi.h.tool_result({ toolName: "bash", content: [{ type: "text", text: "ok" }] })).toBeUndefined();
  });
});
