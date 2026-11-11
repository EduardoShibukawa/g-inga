// Verbo `ledger` (T914, leitura): o ledger é do pinga; aqui só se lê, por
// comando configurável como a fila — `[commands].ledger` do project.toml,
// padrão `pinga ledger list --json --limit 200`. O verbo soma o que a tela
// Ledger mostra; comando que falha vira `error` no payload (a tela explica).

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { VerbCtx } from "./registry.ts";

export const DEFAULT_LEDGER = "pinga ledger list --json --limit 200";
const WEEK_MS = 7 * 86_400_000;

type Row = Record<string, unknown>;

function ledgerCommand(root: string): string {
  let raw = "";
  try {
    raw = readFileSync(join(root, "project.toml"), "utf8");
  } catch {
    return DEFAULT_LEDGER;
  }
  let section = "";
  for (const line of raw.split("\n")) {
    const head = line.match(/^\s*\[([^\]]+)\]\s*$/);
    if (head) {
      section = head[1]!.trim();
      continue;
    }
    const kv = section === "commands" ? line.match(/^\s*ledger\s*=\s*"(.*)"\s*$/) : null;
    if (kv) return kv[1]!;
  }
  return DEFAULT_LEDGER;
}

const shq = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;

function empty(error: string) {
  return { chain: null, total: 0, rows: [] as Row[], week: { pass: 0, total: 0 }, red_failed: 0, error };
}

export function ledger(ctx: VerbCtx): unknown {
  const workspace = dirname(ctx.root);
  const command = ledgerCommand(ctx.root).replace(/\{root\}/g, shq(workspace));
  const p = Bun.spawnSync(["sh", "-c", command], { cwd: workspace, env: { ...process.env }, stdout: "pipe", stderr: "pipe" });
  if (p.exitCode !== 0) {
    const detail = p.stderr.toString().trim().split("\n")[0] ?? "";
    return empty(`o comando do ledger saiu com ${p.exitCode}${detail ? `: ${detail}` : ""}`);
  }
  let parsed: any;
  try {
    parsed = JSON.parse(p.stdout.toString());
  } catch {
    return empty("o comando do ledger não respondeu JSON");
  }
  if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.rows)) {
    return empty("o comando do ledger respondeu sem `rows`");
  }
  const rows = parsed.rows as Row[];
  const since = Date.now() - WEEK_MS;
  const week = { pass: 0, total: 0 };
  let redFailed = 0;
  for (const r of rows) {
    if (r.flow === "prove_red") {
      if (r.status !== "pass") redFailed += 1;
      continue;
    }
    const at = Date.parse(String(r.created_at ?? ""));
    if (!Number.isFinite(at) || at < since) continue;
    week.total += 1;
    if (r.status === "pass") week.pass += 1;
  }
  return {
    chain: parsed.chain ?? null,
    total: typeof parsed.total === "number" ? parsed.total : rows.length,
    rows,
    week,
    red_failed: redFailed,
  };
}
