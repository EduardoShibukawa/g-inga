import { afterEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startApi } from "../src/api/server";
import { cidrMatch, makeAuth, safeEqual } from "../src/api/auth";

/**
 * PLAN-0011 TASK-04: auth da API.
 * - `src/api/auth.ts`: `safeEqual(a, b)` (tempo constante; tamanhos diferentes → false), `cidrMatch(ip, cidr)` (IPv4, "a.b.c.d/n"),
 *   `makeAuth({token?, allow?}) → (req, ip) => {ok: true, principal} | {ok: false}`.
 *   `Authorization: Bearer <token>` igual ao token → principal "token"; sem token válido, IP em `allow` (CIDRs) → principal `ip:<ip>`.
 * - `startApi({..., auth?: {token?, allow?}})`: sem `auth`, a API continua aberta (loopback, como na TASK-03). Com `auth`, TODO caminho
 *   (inclusive o fallback `/`) exige credencial; sem ela → 401 com corpo exatamente "unauthorized" (sem detalhe, sem eco do token).
 *   Com `auth`, o `by` gravado nos verbos de escrita é o principal (o header X-Ginga-By é ignorado: não se forja identidade).
 * - `ginga serve`: token de `GINGA_TOKEN` ou do arquivo `[serve].token_file`; CIDRs em `[serve].allow = ["a.b.c.d/n", …]`.
 *   Sem token e sem allow, `--host` ≠ 127.0.0.1 → exit 2 com "auth" na mensagem (stderr) e sem subir. Com token, `--host 0.0.0.0` sobe e exige o token.
 */

setDefaultTimeout(20000);

const ROOT = join(import.meta.dir, "..");
const BIN = join(ROOT, "bin", "ginga.ts");

const dirs: string[] = [];
const stops: Array<() => void> = [];
const procs: Array<{ kill: () => void }> = [];
afterEach(() => {
  for (const s of stops.splice(0)) s();
  for (const p of procs.splice(0)) p.kill();
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  delete process.env.GINGA_EVENTS;
  delete process.env.GINGA_STATE_DB;
});

function bundle() {
  const dir = realpathSync(mkdtempSync(join(realpathSync(tmpdir()), "ginga-auth-")));
  dirs.push(dir);
  const root = join(dir, "bundle");
  mkdirSync(join(root, "specs"), { recursive: true });
  writeFileSync(join(root, "specs", "SPEC-0001-auth.md"), "---\ntype: spec\ntitle: Auth\nstatus: draft\n---\n## Objetivo\nx\n");
  return { dir, root, dbPath: join(dir, "state.db"), events: join(dir, "events.jsonl") };
}

function boot(auth?: { token?: string; allow?: string[] }) {
  const fx = bundle();
  process.env.GINGA_EVENTS = fx.events;
  process.env.GINGA_STATE_DB = fx.dbPath;
  const api = startApi({ root: fx.root, dbPath: fx.dbPath, port: 0, fallback: () => new Response("raiz\n"), ...(auth ? { auth } : {}) });
  stops.push(() => api.stop());
  return { fx, base: `http://127.0.0.1:${api.port}` };
}

const approve = (base: string, headers: Record<string, string> = {}) =>
  fetch(`${base}/v1/verbs/approve`, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify({ id: "SPEC-0001" }) });

describe("auth.ts", () => {
  test("safeEqual: igual true; diferente ou de outro tamanho false", () => {
    expect(safeEqual("s3cret", "s3cret")).toBe(true);
    expect(safeEqual("s3cret", "s3creT")).toBe(false);
    expect(safeEqual("s3cret", "s3cret-longo")).toBe(false);
    expect(safeEqual("", "x")).toBe(false);
  });

  test("cidrMatch IPv4", () => {
    expect(cidrMatch("100.64.1.2", "100.64.0.0/10")).toBe(true);
    expect(cidrMatch("100.128.0.1", "100.64.0.0/10")).toBe(false);
    expect(cidrMatch("10.1.2.3", "10.1.2.3/32")).toBe(true);
    expect(cidrMatch("10.1.2.4", "10.1.2.3/32")).toBe(false);
    expect(cidrMatch("192.168.0.9", "0.0.0.0/0")).toBe(true);
    expect(cidrMatch("::1", "10.0.0.0/8")).toBe(false);
  });

  test("makeAuth: Bearer correto → principal token; errado ou sem header → ok false", () => {
    const auth = makeAuth({ token: "s3cret" });
    const req = (h: Record<string, string>) => new Request("http://x/v1/verbs", { headers: h });
    expect(auth(req({ authorization: "Bearer s3cret" }), "9.9.9.9")).toEqual({ ok: true, principal: "token" });
    expect(auth(req({ authorization: "Bearer outro" }), "9.9.9.9").ok).toBe(false);
    expect(auth(req({ authorization: "s3cret" }), "9.9.9.9").ok).toBe(false);
    expect(auth(req({}), "9.9.9.9").ok).toBe(false);
  });

  test("makeAuth: IP na allowlist entra sem token com principal ip:<ip>", () => {
    const auth = makeAuth({ token: "s3cret", allow: ["100.64.0.0/10"] });
    const r = new Request("http://x/");
    expect(auth(r, "100.100.1.1")).toEqual({ ok: true, principal: "ip:100.100.1.1" });
    expect(auth(r, "8.8.8.8").ok).toBe(false);
  });
});

describe("startApi com auth", () => {
  test("sem auth configurada a API continua aberta", async () => {
    const { base } = boot();
    expect((await fetch(`${base}/v1/verbs`)).status).toBe(200);
  });

  test("sem credencial → 401 'unauthorized' em /v1/verbs, POST e fallback", async () => {
    const { base } = boot({ token: "s3cret" });
    for (const res of [await fetch(`${base}/v1/verbs`), await approve(base), await fetch(`${base}/`)]) {
      expect(res.status).toBe(401);
      expect(await res.text()).toBe("unauthorized");
    }
  });

  test("token errado → 401 sem eco do token; certo → 200", async () => {
    const { base } = boot({ token: "s3cret" });
    const bad = await fetch(`${base}/v1/verbs`, { headers: { Authorization: "Bearer s3cret-errado" } });
    expect(bad.status).toBe(401);
    expect(await bad.text()).not.toContain("s3cret");
    const ok = await fetch(`${base}/v1/verbs`, { headers: { Authorization: "Bearer s3cret" } });
    expect(ok.status).toBe(200);
    expect(await (await fetch(`${base}/`, { headers: { Authorization: "Bearer s3cret" } })).text()).toBe("raiz\n");
  });

  test("allowlist: loopback na lista entra sem token; fora da lista → 401", async () => {
    const dentro = boot({ allow: ["127.0.0.0/8"] });
    expect((await fetch(`${dentro.base}/v1/verbs`)).status).toBe(200);
    const fora = boot({ allow: ["10.0.0.0/8"] });
    expect((await fetch(`${fora.base}/v1/verbs`)).status).toBe(401);
  });

  test("SSE também exige credencial", async () => {
    const { base } = boot({ token: "s3cret" });
    expect((await fetch(`${base}/v1/events`)).status).toBe(401);
  });

  test("verbo de escrita registra o principal no by; X-Ginga-By é ignorado", async () => {
    const tok = boot({ token: "s3cret" });
    expect((await approve(tok.base, { Authorization: "Bearer s3cret", "X-Ginga-By": "forjado" })).status).toBe(200);
    const ev = readFileSync(tok.fx.events, "utf8").trim().split("\n").map((l) => JSON.parse(l)).find((e) => e.kind === "transition");
    expect(ev.data.by).toBe("token");

    const ip = boot({ allow: ["127.0.0.0/8"] });
    expect((await approve(ip.base, { "X-Ginga-By": "forjado" })).status).toBe(200);
    const ev2 = readFileSync(ip.fx.events, "utf8").trim().split("\n").map((l) => JSON.parse(l)).find((e) => e.kind === "transition");
    expect(ev2.data.by).toBe("ip:127.0.0.1");
  });
});

describe("ginga serve", () => {
  async function freePort(): Promise<number> {
    const s = Bun.serve({ port: 0, fetch: () => new Response("") });
    const p = s.port;
    s.stop(true);
    return p;
  }
  function serve(toml: string, args: string[], env: Record<string, string> = {}) {
    const dir = realpathSync(mkdtempSync(join(realpathSync(tmpdir()), "ginga-authserve-")));
    dirs.push(dir);
    mkdirSync(join(dir, ".ginga"), { recursive: true });
    writeFileSync(join(dir, ".ginga", "project.toml"), toml(dir));
    writeFileSync(join(dir, "token"), "do-arquivo\n");
    const p = Bun.spawn(["bun", BIN, "serve", "--root", dir, ...args], {
      cwd: dir,
      env: { PATH: process.env.PATH ?? "", HOME: dir, GINGA_STATE_DB: join(dir, "state.db"), ...env },
      stdout: "pipe",
      stderr: "pipe",
    });
    procs.push(p);
    return { p, dir };
  }
  async function up(port: number, headers: Record<string, string> = {}): Promise<Response | null> {
    const end = Date.now() + 8000;
    while (Date.now() < end) {
      try {
        return await fetch(`http://127.0.0.1:${port}/v1/verbs`, { headers });
      } catch {
        await Bun.sleep(50);
      }
    }
    return null;
  }

  test("sem token e sem allow: --host 0.0.0.0 → exit 2 citando auth", async () => {
    const port = await freePort();
    const { p } = serve(() => `[serve]\nport = ${port}\n`, ["--host", "0.0.0.0"]);
    expect(await p.exited).toBe(2);
    expect((await new Response(p.stderr).text()).toLowerCase()).toContain("auth");
  });

  test("GINGA_TOKEN + --host 0.0.0.0: sobe e exige o token", async () => {
    const port = await freePort();
    serve(() => `[serve]\nport = ${port}\n`, ["--host", "0.0.0.0"], { GINGA_TOKEN: "do-env" });
    const sem = await up(port);
    expect(sem?.status).toBe(401);
    expect((await up(port, { Authorization: "Bearer do-env" }))?.status).toBe(200);
  });

  test("[serve].token_file é lido (aparado) e exigido, mesmo em loopback", async () => {
    const port = await freePort();
    serve((dir) => `[serve]\nport = ${port}\ntoken_file = "${dir}/token"\n`, []);
    expect((await up(port))?.status).toBe(401);
    expect((await up(port, { Authorization: "Bearer do-arquivo" }))?.status).toBe(200);
  });

  test("[serve].allow com o loopback libera sem token", async () => {
    const port = await freePort();
    serve(() => `[serve]\nport = ${port}\nallow = ["127.0.0.0/8"]\n`, []);
    expect((await up(port))?.status).toBe(200);
  });
});
