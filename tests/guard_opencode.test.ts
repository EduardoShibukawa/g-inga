import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GingaGuard } from "../contrib/guard/opencode";

let root: string, cwd: string, home: string, prevCwd: string;
const KEY = "nvapi-" + "A".repeat(48);
beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "guard-oc-")); cwd = join(root, "work"); home = join(root, "home");
  mkdirSync(cwd, { recursive: true }); mkdirSync(join(home, ".pi/agent"), { recursive: true });
  writeFileSync(join(cwd, ".env"), "FAKE=1\n"); writeFileSync(join(cwd, "README.md"), "oi\n");
  prevCwd = process.cwd(); process.chdir(cwd);
});
afterAll(() => { process.chdir(prevCwd); rmSync(root, { recursive: true, force: true }); });
const lane = () => ({ GINGA_GUARD_LANE: "lane-test", HOME: home });

describe("plugin opencode", () => {
  test("fora de lane não registra hooks", async () => {
    expect(Object.keys(await GingaGuard({}, { HOME: home }))).toHaveLength(0);
  });
  test("shell: cat .env lança erro", async () => {
    const h: any = await GingaGuard({}, lane());
    await expect(h["tool.execute.before"]({ tool: "shell" }, { args: { command: "cat .env" } })).rejects.toThrow(/guard-segredos: .*\[(?!guard_error)/);
  });
  test("shell: cat ~/.pi/agent/auth.json lança erro", async () => {
    const h: any = await GingaGuard({}, lane());
    await expect(h["tool.execute.before"]({ tool: "shell" }, { args: { command: "cat ~/.pi/agent/auth.json" } })).rejects.toThrow(/guard-segredos: .*\[(?!guard_error)/);
  });
  test("read de .env lança erro", async () => {
    const h: any = await GingaGuard({}, lane());
    await expect(h["tool.execute.before"]({ tool: "read" }, { args: { path: ".env" } })).rejects.toThrow();
  });
  test("shell: cat README.md passa", async () => {
    const h: any = await GingaGuard({}, lane());
    await expect(h["tool.execute.before"]({ tool: "shell" }, { args: { command: "cat README.md" } })).resolves.toBeUndefined();
  });
  test("tool.execute.after redige a saída", async () => {
    const h: any = await GingaGuard({}, lane());
    const out = { output: `x ${KEY} y` };
    await h["tool.execute.after"]({ tool: "shell" }, out);
    expect(out.output).not.toContain(KEY);
  });
});
