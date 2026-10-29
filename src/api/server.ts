// API HTTP do registro de verbos (PLAN-0011 TASK-03, T122): a superfície é
// gerada de src/verbs/registry.ts — nenhuma regra por verbo aqui; a resposta
// de um POST é exatamente o JSON do `run` (igual à CLI --json). Sem auth até
// a TASK-04: escuta 127.0.0.1 por padrão.
//
// - GET  /v1/verbs        → [{name, path, args, write}] de todo verbo do registro
//   (`path` = nome com espaço → `-`; o conjunto de rotas É o do registro).
// - POST /v1/verbs/:nome  → args de texto no corpo JSON; `via`/`by` vêm dos
//   headers X-Ginga-Via/X-Ginga-By (padrão "web").
// - GET  /v1/events       → SSE da tabela `events` (src/api/sse.ts).
// Erros: verbo desconhecido 404; método errado 405; corpo que não é objeto
// JSON ou argumento obrigatório ausente 400; falha do verbo 422.

import { openStateDb } from "../state/db.ts";
import { VERBS, runVerb, type Verb, type VerbArgs, type VerbCtx } from "../verbs/registry.ts";
import { sseResponse } from "./sse.ts";

export type ApiOpts = {
  /** Raiz do bundle sobre o qual os verbos agem. */
  root: string;
  /** Caminho do state.db (tabela `events` do SSE). */
  dbPath: string;
  /** Padrão loopback: não há auth até o PLAN-0011 TASK-04. */
  hostname?: string;
  /** 0 pede porta livre; é o que os testes e o serve usam como default. */
  port?: number;
  /** Intervalo do poll do SSE (ms); padrão 250. */
  ssePollMs?: number;
  /** $GINGA_EVENTS a ingerir a cada poll do SSE (opcional). */
  eventsPath?: string;
  /** Resposta para caminhos fora da API (é assim que `ginga serve` divide o servidor). */
  fallback?: (req: Request) => Response | Promise<Response>;
};

const slug = (name: string): string => name.replace(/ /g, "-");

/** Nome do verbo no registro a partir do slug da rota (inverso do `path`). */
function verbBySlug(slugName: string): Verb | undefined {
  return VERBS.find((v) => slug(v.name) === slugName);
}

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const fail = (status: number, message: string): Response => json({ error: message }, status);

export function startApi(opts: ApiOpts): { port: number; hostname: string; stop(): void } {
  const hostname = opts.hostname ?? "127.0.0.1";
  const db = openStateDb(opts.dbPath);
  const timers = new Set<ReturnType<typeof setInterval>>();

  /** POST de um verbo: valida corpo/args (400) e roda via runVerb (422 se falhar). */
  async function execute(verb: Verb, req: Request): Promise<Response> {
    let body: unknown;
    try {
      body = JSON.parse(await req.text());
    } catch {
      return fail(400, "corpo deve ser JSON");
    }
    if (body === null || typeof body !== "object" || Array.isArray(body)) {
      return fail(400, "corpo deve ser um objeto JSON de argumentos");
    }
    const raw = body as Record<string, unknown>;
    for (const [k, v] of Object.entries(raw)) {
      if (typeof v !== "string") return fail(400, `argumento deve ser texto: ${k}`);
    }
    const args: VerbArgs = {};
    for (const a of verb.args) {
      const v = raw[a.name];
      if (typeof v === "string") args[a.name] = v;
    }
    // Mesma regra de obrigatório do registry.runVerb — aqui vira 400, não exceção.
    for (const a of verb.args) {
      if (a.required && (args[a.name] === undefined || args[a.name]!.trim() === "")) {
        return fail(400, `falta argumento: ${a.name}`);
      }
    }
    const ctx: VerbCtx = {
      by: req.headers.get("x-ginga-by") ?? "web",
      via: req.headers.get("x-ginga-via") ?? "web",
      root: opts.root,
      db,
    };
    try {
      return json(await runVerb(verb.name, ctx, args));
    } catch (e) {
      return fail(422, (e as Error).message);
    }
  }

  async function route(req: Request): Promise<Response> {
    const path = new URL(req.url).pathname;

    if (path === "/v1/verbs") {
      if (req.method !== "GET") return fail(405, "use GET para listar os verbos");
      return json(
        VERBS.map((v) => ({ name: v.name, path: `/v1/verbs/${slug(v.name)}`, args: v.args, write: v.write })),
      );
    }

    const verbMatch = /^\/v1\/verbs\/([^/]+)$/.exec(path);
    if (verbMatch) {
      const verb = verbBySlug(verbMatch[1]!);
      if (!verb) return fail(404, `verbo desconhecido: ${verbMatch[1]}`);
      if (req.method !== "POST") return fail(405, "use POST para rodar um verbo");
      return execute(verb, req);
    }

    if (path === "/v1/events") {
      if (req.method !== "GET") return fail(405, "use GET para o stream de eventos");
      return sseResponse(
        db,
        {
          pollMs: opts.ssePollMs ?? 250,
          eventsPath: opts.eventsPath,
          lastEventId: req.headers.get("last-event-id"),
        },
        timers,
      );
    }

    if (opts.fallback) return opts.fallback(req);
    return fail(404, "não encontrado");
  }

  const server = Bun.serve({ hostname, port: opts.port ?? 0, fetch: (req) => route(req) });

  return {
    port: server.port,
    hostname,
    stop() {
      for (const t of [...timers]) clearInterval(t);
      timers.clear();
      server.stop(true);
      try {
        db.close();
      } catch {
        // já fechado: nada a derrubar
      }
    },
  };
}
