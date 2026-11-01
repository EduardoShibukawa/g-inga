#!/usr/bin/env bun
/**
 * Hook do mod claude-mod-handoff: lê o JSON do evento do Claude Code em stdin
 * e repassa para `ginga handoff hook --runtime claude`, que decide e imprime a
 * resposta no formato do runtime. Zero lógica de decisão aqui — toda a
 * decisão ( gatilho, handoff, redirect ) é da CLI do ginga.
 */
import { spawnSync } from "node:child_process";

const chunks: Buffer[] = [];
for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
const input = Buffer.concat(chunks).toString("utf8");

const res = spawnSync(
  "ginga",
  ["handoff", "hook", "--runtime", "claude"],
  {
    input,
    encoding: "utf8",
    stdio: ["pipe", "inherit", "inherit"],
  },
);
process.exit(res.status ?? 1);
