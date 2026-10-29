// SSE (Server-Sent Events) da tabela `events` do state.db (PLAN-0011 TASK-03,
// base: p-inga/web/sse.ts). Uma conexão = um ReadableStream com poll próprio:
// cada linha nova (`rowid >` último visto, ordem de inserção) vira um bloco
// `id/event/data`. Sem `Last-Event-ID` só entram eventos novos; com ele, os
// posteriores ao id dado são reenviados antes de seguir ao vivo. Quando
// `eventsPath` é definido, cada poll ingere o arquivo ($GINGA_EVENTS) antes
// de ler a tabela — a ingestão é de src/state/ingest.ts, este módulo só
// transmite.

import type { Database } from "bun:sqlite";
import { ingestEvents } from "../state/ingest.ts";

const encoder = new TextEncoder();

/** Comentário SSE (`:` linha) — ignorado por clientes, mas obriga o servidor
 *  a despejar os headers no socket: sem primeiro byte, `fetch` pendura até o
 *  idle timeout (Bun só envia headers junto do primeiro chunk do stream). */
const HEARTBEAT = encoder.encode(": ping\n\n");

export type SseOpts = {
  /** Intervalo do poll à tabela, em ms. */
  pollMs: number;
  /** Arquivo de eventos a ingerir antes de cada poll (opcional). */
  eventsPath?: string;
  /** Header `Last-Event-ID`: a partir de qual evento reenviar (null = só ao vivo). */
  lastEventId?: string | null;
};

type Timer = ReturnType<typeof setInterval>;

/** Rowid de onde começar: posterior ao Last-Event-ID, ou o fim da tabela.
 *  Id desconhecido cai no fim (não inventa replay). */
function startRowid(db: Database, lastEventId: string | null): number {
  const max = () =>
    Number((db.query("SELECT COALESCE(MAX(rowid), 0) AS m FROM events").get() as { m: number }).m);
  if (lastEventId === null) return max();
  const row = db.query("SELECT rowid AS r FROM events WHERE id = ?").get(lastEventId) as
    | { r: number }
    | null;
  return row !== null ? Number(row.r) : max();
}

/** Response `text/event-stream` de uma conexão; o timer do poll entra no
 *  conjunto `timers` para o servidor derrubar tudo em `stop()`. */
export function sseResponse(db: Database, opts: SseOpts, timers: Set<Timer>): Response {
  let timer: Timer | null = null;
  const cleanup = () => {
    if (timer === null) return;
    timers.delete(timer);
    clearInterval(timer);
    timer = null;
  };

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let lastRow = startRowid(db, opts.lastEventId ?? null);
      const pump = () => {
        try {
          if (opts.eventsPath !== undefined) {
            try {
              ingestEvents(opts.eventsPath);
            } catch {
              // arquivo fora do ar não derruba a stream: segue com a tabela
            }
          }
          const rows = db
            .query("SELECT rowid AS r, id, kind, json FROM events WHERE rowid > ? ORDER BY rowid")
            .all(lastRow) as Array<{ r: number; id: string; kind: string | null; json: string }>;
          for (const row of rows) {
            controller.enqueue(
              encoder.encode(`id: ${row.id}\nevent: ${row.kind ?? "message"}\ndata: ${row.json}\n\n`),
            );
            lastRow = Number(row.r);
          }
          if (rows.length === 0) controller.enqueue(HEARTBEAT);
        } catch {
          cleanup(); // db fechado ou cliente desligado: não há mais o que pollar
        }
      };
      pump(); // replay imediato no connect, sem esperar o primeiro poll
      timer = setInterval(pump, opts.pollMs);
      timers.add(timer);
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      "x-accel-buffering": "no",
    },
  });
}
