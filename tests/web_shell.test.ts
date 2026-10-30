import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, realpathSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startApi } from "../src/api/server";

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe("web shell (PLAN-0012 TASK-02)", () => {
  test("GET / serve index.html com nav inbox|board|plan; /app.js e /style.css 200; sem token 401 com auth", async () => {
    const dir = realpathSync(mkdtempSync(join(realpathSync(tmpdir()), "ginga-web-")));
    dirs.push(dir);
    const root = join(dir, ".ginga");
    mkdirSync(root, { recursive: true });
    const webDir = join(dir, "web");
    mkdirSync(webDir, { recursive: true });
    writeFileSync(join(webDir, "index.html"), `<!DOCTYPE html><html><head></head><body><nav data-view="inbox|board|plan">nav</nav></body></html>`);
    writeFileSync(join(webDir, "app.js"), `console.log("app")`);
    writeFileSync(join(webDir, "style.css"), `body{}`);
    const dbPath = join(dir, "state.db");
    const api = startApi({
      root,
      dbPath,
      port: 0,
      auth: { token: "t" },
      fallback: async (req) => {
        const url = new URL(req.url);
        if (url.pathname === "/") {
          const f = Bun.file(join(webDir, "index.html"));
          if (await f.exists()) return new Response(await f.text(), { status: 200, headers: { "content-type": "text/html" } });
        }
        if (url.pathname === "/app.js") {
          const f = Bun.file(join(webDir, "app.js"));
          if (await f.exists()) return new Response(await f.text(), { status: 200, headers: { "content-type": "text/javascript" } });
        }
        if (url.pathname === "/style.css") {
          const f = Bun.file(join(webDir, "style.css"));
          if (await f.exists()) return new Response(await f.text(), { status: 200, headers: { "content-type": "text/css" } });
        }
        return new Response("ginga serve\n", { status: 200 });
      },
    });
    try {
      const r1 = await fetch(`http://${api.hostname}:${api.port}/`);
      expect(r1.status).toBe(401);
      expect(await r1.text()).toBe("unauthorized");
      const r2 = await fetch(`http://${api.hostname}:${api.port}/`, { headers: { authorization: "Bearer t" } });
      expect(r2.status).toBe(200);
      const t2 = await r2.text();
      expect(t2).toContain('nav data-view="inbox|board|plan"');
      const r3 = await fetch(`http://${api.hostname}:${api.port}/app.js`, { headers: { authorization: "Bearer t" } });
      expect(r3.status).toBe(200);
      const r4 = await fetch(`http://${api.hostname}:${api.port}/style.css`, { headers: { authorization: "Bearer t" } });
      expect(r4.status).toBe(200);
    } finally {
      api.stop();
    }
  });
});
