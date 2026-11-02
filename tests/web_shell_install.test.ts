import { afterEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

setDefaultTimeout(20000);

const ROOT = join(import.meta.dir, "..");
const BIN = join(ROOT, "bin", "ginga.ts");
// web/ da instalação do ginga (ao lado de src/), usado quando o root não tem web/
const INSTALL_WEB = join(ROOT, "web");
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

function setup(port: number, opts: { withWeb?: boolean } = {}) {
  const dir = realpathSync(mkdtempSync(join(realpathSync(tmpdir()), "ginga-web-inst-")));
  dirs.push(dir);
  mkdirSync(join(dir, ".ginga"), { recursive: true });
  if (opts.withWeb) {
    mkdirSync(join(dir, "web"), { recursive: true });
    writeFileSync(join(dir, "web", "index.html"), "<!doctype html><title>web-do-workspace</title>");
  }
  writeFileSync(join(dir, ".ginga", "project.toml"), `[serve]\ntick_seconds = 3600\nport = ${port}\n`);
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

describe("fallback do serve usa o web/ da instalação (PLAN-0012 follow-up do judge, TASK-02)", () => {
  test("workspace real (root SEM web/) → GET / devolve o index.html da instalação e /app.js existe", async () => {
    const port = await freePort();
    const w = setup(port); // sem web/ no root: é o caso de um workspace real (ex. duh-homelab/)
    w.serve();
    expect(await listening(port)).toBe(true);
    const home = await fetch(`http://127.0.0.1:${port}/`);
    expect(home.status).toBe(200);
    expect(home.headers.get("content-type")).toContain("text/html");
    const html = await home.text();
    // deve ser o web/ da instalação do ginga, não o fallback "ginga serve"
    expect(html).toContain('nav data-view="inbox|board|plan"');
    expect(html).toContain("<title>Roda");
    const js = await fetch(`http://127.0.0.1:${port}/app.js`);
    expect(js.status).toBe(200);
    expect(js.headers.get("content-type")).toContain("javascript");
    const css = await fetch(`http://127.0.0.1:${port}/style.css`);
    expect(css.status).toBe(200);
    const missing = await fetch(`http://127.0.0.1:${port}/nao-existe.js`);
    expect(missing.status).toBe(404);
    expect(INSTALL_WEB).toContain(join("web"));
  });

  test("root COM web/ próprio → o web/ do workspace continua valendo (override)", async () => {
    const port = await freePort();
    const w = setup(port, { withWeb: true });
    w.serve();
    expect(await listening(port)).toBe(true);
    const home = await fetch(`http://127.0.0.1:${port}/`);
    expect(home.status).toBe(200);
    expect(await home.text()).toContain("<title>web-do-workspace</title>");
  });
});
