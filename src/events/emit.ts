import { openSync, closeSync, writeSync } from "node:fs";

// ULID: 26 chars, Crockford base32 (A-HJKMNP-TV-Z + 0-9).
const ENC = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

function encodeTime(ms: number, len: number): string {
  let out = "";
  for (let i = 0; i < len; i++) {
    out = ENC[ms % 32] + out;
    ms = Math.floor(ms / 32);
  }
  return out;
}

export function ulid(now: number = Date.now()): string {
  // 10 chars de tempo + 16 chars de aleatoriedade.
  let rand = "";
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  for (let i = 0; i < 16; i++) rand += ENC[bytes[i]! % 32];
  return encodeTime(now, 10) + rand;
}

/**
 * Emite um evento v1: append de uma linha JSON no caminho de $GINGA_EVENTS
 * (JSONL, UTF-8, "\n" no fim). Sem a variável definida, não escreve nada.
 * Uma linha por write() com O_APPEND, abaixo de 4 KiB, para ser atômica
 * entre processos.
 */
export function emitEvent(ev: Record<string, unknown>): void {
  const path = process.env.GINGA_EVENTS;
  if (!path) return;

  const event = {
    v: 1,
    ts: new Date().toISOString(),
    ...ev,
    id: (ev.id as string | undefined) ?? ulid(),
  };

  const line = JSON.stringify(event) + "\n";
  if (Buffer.byteLength(line, "utf8") >= 4096) {
    throw new Error(`evento maior que 4 KiB: ${Buffer.byteLength(line, "utf8")} bytes`);
  }

  const fd = openSync(path, "a"); // O_APPEND
  try {
    const buf = Buffer.from(line, "utf8");
    let written = 0;
    while (written < buf.length) {
      written += writeSync(fd, buf.subarray(written));
    }
  } finally {
    closeSync(fd);
  }
}
