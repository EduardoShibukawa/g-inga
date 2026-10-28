import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

import { validateEvent } from "./validate.ts";

// ULID: 26 chars, Crockford base32 (A-HJKMNP-TV-Z + 0-9).
const ENC = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

const SOURCE = "pi-harness";

type Legacy = Record<string, unknown>;

export type MigrateResult = {
  written: number;
  invalid: number;
};

function encodeTime(ms: number, len: number): string {
  let out = "";
  for (let i = 0; i < len; i++) {
    out = ENC[ms % 32] + out;
    ms = Math.floor(ms / 32);
  }
  return out;
}

/**
 * ULID determinístico: 10 chars do ts + 16 chars do sha256 da linha.
 * A mesma linha de entrada sempre gera o mesmo id.
 */
function deterministicId(ts: unknown, line: string): string {
  const ms = typeof ts === "string" ? Date.parse(ts) : NaN;
  const digest = createHash("sha256").update(line).digest();
  let rand = "";
  for (let i = 0; i < 16; i++) rand += ENC[digest[i]! % 32];
  return encodeTime(Number.isFinite(ms) ? ms : 0, 10) + rand;
}

function specRef(specId: unknown): string | undefined {
  if (typeof specId !== "string" || specId === "") return undefined;
  return /^SPEC-/i.test(specId) ? specId : `SPEC-${specId}`;
}

function str(v: unknown): string | undefined {
  return typeof v === "string" && v !== "" ? v : undefined;
}

function num(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

function attemptData(ev: Legacy): Record<string, unknown> {
  const data: Record<string, unknown> = {
    runtime: str(ev.runner),
    passed: ev.passed,
    cost_source: str(ev.costSource) ?? "unknown",
  };
  for (const campo of ["provider", "model", "family", "tier", "failure"] as const) {
    if (ev[campo] !== undefined) data[campo] = ev[campo];
  }
  const duration = num(ev.durationMs);
  if (duration !== undefined) data.duration_ms = duration;
  const tokens = num(ev.tokens);
  if (tokens !== undefined) data.tokens_total = tokens;
  const cost = num(ev.costUsd);
  if (cost !== undefined) data.cost_usd = cost;
  return data;
}

function receiptData(ev: Legacy, ledgerN: number, line: string): Record<string, unknown> {
  const failed = num(ev.failed) ?? 0;
  const data: Record<string, unknown> = {
    ledger_n: ledgerN,
    hash: str(ev.sha) ?? createHash("sha256").update(line).digest("hex"),
    status: failed === 0 ? "pass" : "fail",
    check: "bdd",
  };
  for (const campo of ["feature"] as const) {
    if (ev[campo] !== undefined) data[campo] = ev[campo];
  }
  const passed = num(ev.passed);
  if (passed !== undefined) data.passed = passed;
  if (num(ev.failed) !== undefined) data.failed = failed;
  return data;
}

/**
 * Converte uma linha do events.jsonl do pi-harness para um evento v1.
 * Devolve null quando a linha não é um attempt/verify migrável.
 */
function migrateLine(line: string, ledgerN: { n: number }): Record<string, unknown> | null {
  let ev: unknown;
  try {
    ev = JSON.parse(line);
  } catch {
    return null;
  }
  if (typeof ev !== "object" || ev === null || Array.isArray(ev)) return null;
  const legacy = ev as Legacy;
  const kind = legacy.kind;
  if (kind !== "attempt" && kind !== "verify") return null;

  const out: Record<string, unknown> = {
    v: 1,
    ts: legacy.ts,
    source: SOURCE,
    kind: kind === "verify" ? "receipt" : "attempt",
    id: deterministicId(legacy.ts, line),
    spec: specRef(legacy.specId),
    task: kind === "attempt" ? str(legacy.taskId) : undefined,
    data: kind === "attempt" ? attemptData(legacy) : receiptData(legacy, ledgerN.n++, line),
  };
  for (const campo of ["spec", "task"] as const) {
    if (out[campo] === undefined) delete out[campo];
  }
  return out;
}

/**
 * Lê `input` e escreve o JSONL v1 em `out` (nunca reescreve a entrada).
 * Linhas inválidas são contadas e ignoradas; não abortam a migração.
 */
export function migrateFile(input: string, out: string): MigrateResult {
  const raw = readFileSync(input, "utf8");
  const ledgerN = { n: 1 };
  const migrated: string[] = [];
  let invalid = 0;

  for (const line of raw.split("\n")) {
    if (line.trim() === "") continue;
    const ev = migrateLine(line, ledgerN);
    if (!ev || !validateEvent(ev).ok) {
      invalid++;
      continue;
    }
    migrated.push(JSON.stringify(ev));
  }

  writeFileSync(out, migrated.length === 0 ? "" : migrated.join("\n") + "\n");
  if (invalid > 0) {
    console.error(`${invalid} linha(s) inválida(s) ignorada(s)`);
  }
  return { written: migrated.length, invalid };
}
