#!/usr/bin/env bun
/**
 * Script de apoio da skill handoff: chama `ginga handoff --open` e imprime
 * {path, tokens, open} em JSON para orquestradores.
 */
import { $ } from "bun";

const plan = process.argv[2] ?? undefined;
const runtime = process.env.GINGA_HANDOFF_RUNTIME ?? "claude";

const parts = ["ginga", "handoff", "--open", `--runtime`, runtime];
if (plan) parts.push(plan);

const res = await $`ginga handoff --open --runtime $runtime --notes --parent_handoff`.text();
// Parse do output do ginga handoff (path, tokens)
const lines = res.stdout.split("\n").filter((l) => l.trim());
let path = "";
let tokens = 0;
for (const line of lines) {
  const m = line.match(/(?:^|\s)path\s*[:=]\s*(\S+)/);
  if (m) path = m[1] ?? "";
  const tk = line.match(/(?:^|\s)tokens\s*[:=]\s*(\d+)/);
  if (tk) tokens = Number(tk[1] ?? 0);
}
const open = Boolean(path);
console.log(JSON.stringify({ path, tokens, open }));
