// `ginga events ingest` (PLAN-0010 TASK-01): consome $GINGA_EVENTS a partir do
// offset salvo, valida cada linha com validateEvent, ignora id repetido e
// grava o novo offset (bytes até a última linha completa). O arquivo de
// eventos nunca é reescrito — entrada é strictamente read-only.

import { readFileSync } from "node:fs";
import { validateEvent } from "../events/validate.ts";
import { openStateDb } from "./db.ts";

const LF = 0x0a;

/** Ponto de entrada do comando: resolve $GINGA_EVENTS e ingere. */
export function ingestCommand(): number {
  const path = process.env.GINGA_EVENTS;
  if (!path || path === "") {
    console.error("uso: defina $GINGA_EVENTS com o arquivo .jsonl de eventos");
    return 2;
  }
  try {
    const r = ingestEvents(path);
    console.log(`ingeridos: ${r.inserted} evento(s) de ${path} (até byte ${r.offset})`);
    return 0;
  } catch (e) {
    console.error(`falha ao ingerir ${path}: ${(e as Error).message}`);
    return 1;
  }
}

export function ingestEvents(eventsPath: string): { inserted: number; offset: number } {
  const buf = readFileSync(eventsPath);
  const db = openStateDb();
  const insert = db.prepare(
    "INSERT OR IGNORE INTO events(id, ts, kind, plan, task, json) VALUES(?, ?, ?, ?, ?, ?)",
  );
  try {
    const savedRow = db.query("SELECT byte FROM offsets WHERE path = ?").get(eventsPath) as
      | { byte: number }
      | null;
    const saved = savedRow?.byte ?? 0;
    // Linha final sem \n fica para a próxima rodada: só consumimos até o
    // último \n presente (parando no offset salvo quando não há linha nova).
    let end = buf.length;
    while (end > saved && buf[end - 1] !== LF) end--;

    let inserted = 0;
    let b = Math.min(saved, buf.length);
    let line = 1 + countNewlines(buf.subarray(0, b));
    while (b < end) {
      const nl = buf.indexOf(LF, b);
      const stop = nl < 0 ? end : nl;
      const raw = buf.subarray(b, stop).toString("utf8").trim();
      if (raw !== "" && ingestLine(raw, line, insert)) inserted++;
      b = stop + 1;
      line++;
    }

    db.query(
      "INSERT INTO offsets(path, byte) VALUES(?, ?) ON CONFLICT(path) DO UPDATE SET byte = excluded.byte",
    ).run(eventsPath, b);
    return { inserted, offset: b };
  } finally {
    db.close();
  }
}

/** Insere um evento; devolve true quando a linha era um evento novo válido. */
function ingestLine(raw: string, line: number, insert: any): boolean {
  // Linha inválida é pulada com `linha N` no stderr, sem travar as seguintes.
  let ev: unknown;
  try {
    ev = JSON.parse(raw);
  } catch (e) {
    console.error(`linha ${line}: JSON inválido (${(e as Error).message})`);
    return false;
  }
  const r = validateEvent(ev);
  if (!r.ok) {
    console.error(`linha ${line}: ${r.errors.join("; ")}`);
    return false;
  }
  const obj = ev as Record<string, unknown>;
  const res = insert.run(
    obj.id,
    obj.ts as string,
    obj.kind as string,
    obj.plan as string,
    obj.task as string,
    raw,
  );
  return res.changes > 0; // id repetido: INSERT OR IGNORE não altera nada
}

function countNewlines(buf: Uint8Array): number {
  let n = 0;
  for (let i = 0; i < buf.length; i++) {
    if (buf[i] === LF) n++;
  }
  return n;
}
