import { afterEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

setDefaultTimeout(20000);

const ROOT = join(import.meta.dir, "..");
const BIN = join(ROOT, "bin", "ginga.ts");
const dirs: string[] = [];
const procs: { kill: () => void }[] = [];
afterEach(() => {
  for (const p of procs.splice(0)) p.kill();
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

async function freePort(): Promise<number> {
  const s = Bun.serve({ port: 0, fetch: () => new Response("") });
  const port = s.port;
  s.stop(true);
  return port;
}

function setup(port: number, token?: string) {
  const dir = realpathSync(mkdtempSync(join(realpathSync(tmpdir()), "ginga-web-")));
  dirs.push(dir);
  mkdirSync(join(dir, ".ginga"), { recursive: true });
  mkdirSync(join(dir, "web"), { recursive: true });
  writeFileSync(join(dir, "web", "index.html"), '<!doctype html><html><body><nav data-view="inbox|board|plan"></nav></body></html>');
  writeFileSync(join(dir, "web", "app.js"), 'console.log("app");');
  writeFileSync(join(dir, "web", "style.css"), 'body{}');
  const toml = token
    ? `[serve]\ntick_seconds = 3600\nport = ${port}\ntoken_file = "token.txt"\n`
    : `[serve]\ntick_seconds = 3600\nport = ${port}\n`;
  writeFileSync(join(dir, ".ginga", "project.toml"), toml);
  if (token) writeFileSync(join(dir, "token.txt"), `${token}\n`);
  const env = { PATH: process.env.PATH ?? "", HOME: dir, GINGA_STATE_DB: join(dir, "state.db") };
  const serve = () => {
    const p = Bun.spawn(["bun", BIN, "serve", "--root", dir], { cwd: dir, env, stdout: "pipe", stderr: "pipe" });
    procs.push(p);
    return p;
  };
  return { dir, serve };
}

async function listening(port: number): Promise<boolean> {
  const end = Date.now() + 8000;
  while (Date.now() < end) {
    try {
      await fetch(`http://127.0.0.1:${port}/`);
      return true;
    } catch {
      await Bun.sleep(50);
    }
  }
  return false;
}

describe("casca da Roda Web (PLAN-0012 TASK-02)", () => {
  test("GET / devolve text/html com nav; /app.js e /style.css existem", async () => {
    const port = await freePort();
    const w = setup(port);
    w.serve();
    expect(await listening(port)).toBe(true);
    const home = await fetch(`http://127.0.0.1:${port}/`);
    expect(home.status).toBe(200);
    expect(home.headers.get("content-type")).toContain("text/html");
    const html = await home.text();
    expect(html).toContain('nav data-view="inbox|board|plan"');
    const js = await fetch(`http://127.0.0.1:${port}/app.js`);
    expect(js.status).toBe(200);
    const css = await fetch(`http://127.0.0.1:${port}/style.css`);
    expect(css.status).toBe(200);
  });

  test("sem token (auth ligada) → 401", async () => {
    const port = await freePort();
    const w = setup(port, "segredo");
    w.serve();
    expect(await listening(port)).toBe(true);
    const home = await fetch(`http://127.0.0.1:${port}/`);
    expect(home.status).toBe(401);
    expect(await home.text()).toBe("unauthorized");
  });
});
