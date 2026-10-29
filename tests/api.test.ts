import { afterEach, beforeEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startApi } from "../src/api/server";
import { openStateDb } from "../src/state/db";
import { VERBS, runVerb, type VerbCtx } from "../src/verbs/registry";

/**
 * PLAN-0011 TASK-03: API HTTP + SSE gerada do registro (`src/verbs/registry.ts`), sem auth (só loopback).
 * - `startApi({root, dbPath, hostname?, port?, ssePollMs?, eventsPath?}) → {port, hostname, stop()}` (src/api/server.ts).
 *   `hostname` padrão 127.0.0.1; `port` padrão 0 (livre); `ssePollMs` padrão 250; `eventsPath` = $GINGA_EVENTS a ingerir a cada poll.
 *   `root` é a raiz do bundle; o state.db é o de `dbPath`.
 * - `GET /v1/verbs` → JSON [{name, path, args, write}] com TODO verbo do registro; `path` = `/v1/verbs/<nome com espaço → ->`
 *   (ex.: "budget raise" → /v1/verbs/budget-raise). O conjunto de rotas é o do registro.
 * - `POST /v1/verbs/:nome` com corpo JSON de argumentos (strings) → 200 com exatamente o resultado do `run` do verbo (igual à CLI --json).
 *   Verbo desconhecido → 404 {error}; método ≠ POST → 405; corpo que não é JSON-objeto → 400 {error};
 *   argumento obrigatório ausente → 400 {error: "falta argumento: x"}; falha na execução do verbo → 422 {error}.
 * - `via` = "web" por padrão, ou o header `X-Ginga-Via`; `by` = header `X-Ginga-By` (padrão "web"). Ambos chegam ao evento.
 * - `GET /v1/events` (SSE, text/event-stream): cada linha da tabela `events` do state.db vira `id: <id>`, `event: <kind>`, `data: <json da linha>`.
 *   Sem `Last-Event-ID` só entram eventos novos; com `Last-Event-ID: X` reenvia os posteriores a X (ordem de inserção) e segue ao vivo.
 *   Com `eventsPath`, cada poll ingere o arquivo antes de ler a tabela.
 * - `ginga serve` usa a API no mesmo servidor (verbos sobre `<root>/.ginga`); `GET /` continua respondendo.
 */

setDefaultTimeout(20000);

const ROOT = join(import.meta.dir, "..");
const BIN = join(ROOT, "bin", "ginga.ts");
const ALPHA = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const ulid = (n: number) => "0".repeat(24) + ALPHA[Math.floor(n / 32) % 32] + ALPHA[n % 32];

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

type Fx = { dir: string; root: string; dbPath: string; events: string; ctx: VerbCtx };

function fixture(): Fx {
  const dir = realpathSync(mkdtempSync(join(realpathSync(tmpdir()), "ginga-api-")));
  dirs.push(dir);
  const root = join(dir, "bundle");
  mkdirSync(join(root, "intents"), { recursive: true });
  mkdirSync(join(root, "specs"), { recursive: true });
  mkdirSync(join(root, "plans", "PLAN-0001-auth"), { recursive: true });
  writeFileSync(join(root, "intents", "INTENT-0001-primeiro.md"), "---\ntype: intent\ntitle: Primeiro\nsource: cli\ntimestamp: 2026-10-27T00:00:00Z\n---\nCorpo.\n");
  writeFileSync(join(root, "specs", "SPEC-0001-auth.md"), "---\ntype: spec\ntitle: Auth\nstatus: draft\n---\n## Objetivo\nx\n");
  writeFileSync(join(root, "plans", "PLAN-0001-auth", "PLAN.md"), "---\ntype: plan\ntitle: Auth plan\nstatus: draft\n---\n## Objetivo\nx\n");
  writeFileSync(join(root, "plans", "PLAN-0001-auth", "log.md"), "# Log — PLAN-0001\n");
  const dbPath = join(dir, "state.db");
  const conn = openStateDb(dbPath);
  conn
    .query("INSERT INTO events(id, ts, kind, plan, task, json) VALUES('01', '2026-10-29T00:00:00Z', 'blocker', 'PLAN-0001', 'TASK-01', ?)")
    .run(JSON.stringify({ data: { blocker_id: "b1", question: "rotação?", raised_by: "manda" } }));
  conn.query("INSERT INTO task_exec(plan, task, status, attempts) VALUES('PLAN-0001', 'TASK-01', 'failed', 2)").run();
  return { dir, root, dbPath, events: join(dir, "events.jsonl"), ctx: { by: "eduardo", via: "web", root, db: conn } };
}

function boot(fx: Fx, extra: Record<string, unknown> = {}) {
  process.env.GINGA_EVENTS = fx.events;
  process.env.GINGA_STATE_DB = fx.dbPath;
  const api = startApi({ root: fx.root, dbPath: fx.dbPath, port: 0, ssePollMs: 30, ...extra });
  stops.push(() => api.stop());
  return { api, base: `http://127.0.0.1:${api.port}` };
}

const post = (base: string, name: string, body: unknown, headers: Record<string, string> = {}) =>
  fetch(`${base}/v1/verbs/${name}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

type Sse = { id?: string; event?: string; data?: string };
/** Lê até `n` eventos SSE do corpo (ou até `ms`). */
async function readSse(res: Response, n: number, ms = 5000): Promise<Sse[]> {
  const out: Sse[] = [];
  const reader = res.body!.getReader();
  const dec = new TextDecoder();
  let buf = "";
  const end = Date.now() + ms;
  while (out.length < n && Date.now() < end) {
    const r = await Promise.race([reader.read(), Bun.sleep(Math.max(1, end - Date.now())).then(() => null)]);
    if (r === null || r.done) break;
    buf += dec.decode(r.value, { stream: true });
    let i: number;
    while ((i = buf.indexOf("\n\n")) >= 0) {
      const block = buf.slice(0, i);
      buf = buf.slice(i + 2);
      const ev: Sse = {};
      for (const line of block.split("\n")) {
        const m = /^(id|event|data): ?(.*)$/.exec(line);
        if (m) (ev as any)[m[1]!] = m[2];
      }
      if (ev.id !== undefined) out.push(ev);
    }
  }
  await reader.cancel().catch(() => {});
  return out;
}

const insertEvent = (fx: Fx, n: number, kind = "blocker") =>
  fx.ctx.db
    .query("INSERT INTO events(id, ts, kind, plan, task, json) VALUES(?, '2026-10-29T01:00:00Z', ?, 'PLAN-0001', 'TASK-01', ?)")
    .run(ulid(n), kind, JSON.stringify({ v: 1, id: ulid(n), kind, data: { n } }));

describe("rotas geradas do registro", () => {
  test("GET /v1/verbs lista todo verbo do registro com path derivado do nome", async () => {
    const { base } = boot(fixture());
    const res = await fetch(`${base}/v1/verbs`);
    expect(res.status).toBe(200);
    const list: any[] = await res.json();
    expect(list.map((v) => v.name).sort()).toEqual(VERBS.map((v) => v.name).sort());
    for (const v of VERBS) {
      const item = list.find((x) => x.name === v.name);
      expect(item.path).toBe(`/v1/verbs/${v.name.replace(/ /g, "-")}`);
      expect(item.write).toBe(v.write);
      expect(item.args.map((a: any) => a.name)).toEqual(v.args.map((a) => a.name));
    }
  });

  test("toda rota do registro existe (nenhuma dá 404/405 com POST)", async () => {
    const { base } = boot(fixture());
    for (const v of VERBS) {
      const res = await post(base, v.name.replace(/ /g, "-"), {});
      expect([404, 405]).not.toContain(res.status);
    }
  });

  test("erros: verbo desconhecido 404, GET na rota 405, corpo inválido 400, argumento ausente 400, falha do verbo 422", async () => {
    const { base } = boot(fixture());
    const unknown = await post(base, "nao-existe", {});
    expect(unknown.status).toBe(404);
    expect(typeof (await unknown.json()).error).toBe("string");
    expect((await fetch(`${base}/v1/verbs/status`)).status).toBe(405);
    expect((await post(base, "status", "isto nao e json")).status).toBe(400);
    expect((await post(base, "status", "[1,2]")).status).toBe(400);
    const missing = await post(base, "approve", {});
    expect(missing.status).toBe(400);
    expect((await missing.json()).error).toContain("falta argumento: id");
    const failed = await post(base, "approve", { id: "PLAN-0099" });
    expect(failed.status).toBe(422);
    expect(typeof (await failed.json()).error).toBe("string");
  });

  test("paridade com a CLI/registro: mesmo JSON do run direto (leitura e escrita)", async () => {
    const viaApi = fixture();
    const direct = fixture();
    const { base } = boot(viaApi);
    for (const [name, args] of [
      ["status", {}],
      ["board", {}],
      ["inbox", {}],
      ["approve", { id: "PLAN-0001" }],
      ["budget raise", { plan: "PLAN-0001", usd: "5" }],
    ] as Array<[string, Record<string, string>]>) {
      const res = await post(base, name.replace(/ /g, "-"), args);
      expect(res.status).toBe(200);
      const expected = await runVerb(name, direct.ctx, args);
      expect(await res.json()).toEqual(JSON.parse(JSON.stringify(expected)));
    }
    expect(readFileSync(join(viaApi.root, "plans", "PLAN-0001-auth", "PLAN.md"), "utf8")).toContain("status: approved");
  });

  test("via padrão web, by/via por header chegam ao evento", async () => {
    const fx = fixture();
    const { base } = boot(fx);
    expect((await post(base, "approve", { id: "SPEC-0001" })).status).toBe(200);
    expect((await post(base, "approve", { id: "PLAN-0001" }, { "X-Ginga-Via": "telegram", "X-Ginga-By": "ana" })).status).toBe(200);
    const evs = readFileSync(fx.events, "utf8").trim().split("\n").map((l) => JSON.parse(l)).filter((e) => e.kind === "transition");
    expect(evs[0].data).toMatchObject({ entity: "spec", via: "web", by: "web" });
    expect(evs[1].data).toMatchObject({ entity: "plan", via: "telegram", by: "ana" });
  });

  test("escuta em 127.0.0.1 por padrão", () => {
    const { api } = boot(fixture());
    expect(api.hostname).toBe("127.0.0.1");
  });
});

describe("SSE em /v1/events", () => {
  test("entrega eventos novos da tabela events com id/event/data", async () => {
    const fx = fixture();
    const { base } = boot(fx);
    const res = await fetch(`${base}/v1/events`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    const got = readSse(res, 2);
    await Bun.sleep(100);
    insertEvent(fx, 1, "blocker");
    insertEvent(fx, 2, "answer");
    const evs = await got;
    expect(evs.map((e) => e.id)).toEqual([ulid(1), ulid(2)]);
    expect(evs.map((e) => e.event)).toEqual(["blocker", "answer"]);
    expect(JSON.parse(evs[0]!.data!)).toMatchObject({ id: ulid(1), data: { n: 1 } });
  });

  test("Last-Event-ID reenvia só os posteriores, em ordem, e depois segue ao vivo", async () => {
    const fx = fixture();
    insertEvent(fx, 1);
    insertEvent(fx, 2);
    insertEvent(fx, 3);
    const { base } = boot(fx);
    const res = await fetch(`${base}/v1/events`, { headers: { "Last-Event-ID": ulid(1) } });
    const got = readSse(res, 3);
    await Bun.sleep(100);
    insertEvent(fx, 4);
    const evs = await got;
    expect(evs.map((e) => e.id)).toEqual([ulid(2), ulid(3), ulid(4)]);
  });

  test("com eventsPath, as linhas novas de $GINGA_EVENTS são ingeridas e entregues", async () => {
    const fx = fixture();
    writeFileSync(fx.events, "");
    const { base } = boot(fx, { eventsPath: fx.events });
    const res = await fetch(`${base}/v1/events`);
    const got = readSse(res, 1);
    await Bun.sleep(100);
    appendFileSync(
      fx.events,
      JSON.stringify({ v: 1, ts: "2026-10-29T02:00:00Z", source: "manda", kind: "blocker", id: ulid(7), plan: "PLAN-0001", task: "TASK-01", data: { blocker_id: "b7", question: "q?", raised_by: "manda" } }) + "\n",
    );
    const evs = await got;
    expect(evs.map((e) => e.id)).toEqual([ulid(7)]);
    expect(evs[0]!.event).toBe("blocker");
  });
});

describe("ginga serve expõe a API", () => {
  test("POST /v1/verbs/status responde com o bundle de <root>/.ginga e GET / continua vivo", async () => {
    const dir = realpathSync(mkdtempSync(join(realpathSync(tmpdir()), "ginga-api-serve-")));
    dirs.push(dir);
    const g = join(dir, ".ginga");
    mkdirSync(join(g, "intents"), { recursive: true });
    writeFileSync(join(g, "intents", "INTENT-0001-primeiro.md"), "---\ntype: intent\ntitle: Primeiro\nsource: cli\ntimestamp: 2026-10-27T00:00:00Z\n---\nCorpo.\n");
    const s = Bun.serve({ port: 0, fetch: () => new Response("") });
    const port = s.port;
    s.stop(true);
    writeFileSync(join(g, "project.toml"), `[serve]\ntick_seconds = 3600\nport = ${port}\n`);
    const events = join(dir, "events.jsonl");
    writeFileSync(events, "");
    const env = { PATH: process.env.PATH ?? "", HOME: dir, GINGA_STATE_DB: join(dir, "state.db"), GINGA_EVENTS: events };
    const p = Bun.spawn(["bun", BIN, "serve", "--root", dir], { cwd: dir, env, stdout: "pipe", stderr: "pipe" });
    procs.push(p);
    const end = Date.now() + 10000;
    let res: Response | null = null;
    while (Date.now() < end) {
      try {
        res = await post(`http://127.0.0.1:${port}`, "status", {});
        break;
      } catch {
        await Bun.sleep(100);
      }
    }
    expect(res?.status).toBe(200);
    const body: any = await res!.json();
    expect(body.intents.map((i: any) => i.id)).toEqual(["INTENT-0001"]);
    expect((await fetch(`http://127.0.0.1:${port}/`)).status).toBe(200);
    expect(existsSync(join(dir, "state.db"))).toBe(true);
  });
});
