#!/usr/bin/env bun
/**
 * Script de apoio da skill handoff: chama `ginga handoff --open` e imprime
 * {path, tokens, open} em JSON para orquestradores.
 */
import { $ } from "bun";

const plan = process.argv[2]?.trim() || undefined;
const runtime = process.env.GINGA_HANDOFF_RUNTIME ?? "claude";

const res = plan
  ? await $`ginga handoff --open --runtime ${runtime} ${plan}`.text()
  : await $`ginga handoff --open --runtime ${runtime}`.text();

// A CLI real responde JSON; o shim pode responder em linhas key: value.
let path = "";
let tokens: number | undefined;
let open: boolean | undefined;
try {
  const parsed = JSON.parse(res.trim()) as Record<string, unknown>;
  if (typeof parsed.path === "string") path = parsed.path;
  if (typeof parsed.tokens === "number") tokens = parsed.tokens;
  if (typeof parsed.open === "boolean") open = parsed.open;
} catch {
  // Fallback para a saída key: value do shim.
}

const lines = res.split("\n").filter((line) => line.trim());
for (const line of lines) {
  const pathMatch = line.match(/(?:^|\s)path\s*[:=]\s*(\S+)/);
  if (!path && pathMatch) path = pathMatch[1] ?? "";
  const tokensMatch = line.match(/(?:^|\s)tokens\s*[:=]\s*(\d+)/);
  if (tokens === undefined && tokensMatch) tokens = Number(tokensMatch[1] ?? 0);
  const openMatch = line.match(/(?:^|\s)open\s*[:=]\s*(true|false)\b/i);
  if (open === undefined && openMatch) open = openMatch[1]?.toLowerCase() === "true";
}

console.log(JSON.stringify({ path, tokens: tokens ?? 0, open: open ?? Boolean(path) }));
