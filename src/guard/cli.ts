#!/usr/bin/env bun
import { guardCall, guardResult } from "./run";

const readStdin = async (): Promise<string> => await new Response(Bun.stdin.stream()).text();

async function main(): Promise<number> {
  const verb = process.argv[2];
  if (verb === "check") {
    const parsed: unknown = JSON.parse(await readStdin());
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("payload inválido");
    const payload = parsed as Record<string, unknown>;
    if (typeof payload.tool !== "string") throw new Error("tool inválido");
    if (!payload.input || typeof payload.input !== "object" || Array.isArray(payload.input)) {
      throw new Error("input inválido");
    }
    if (payload.cwd !== undefined && typeof payload.cwd !== "string") throw new Error("cwd inválido");
    if (payload.home !== undefined && typeof payload.home !== "string") throw new Error("home inválido");

    const verdict = guardCall(payload.tool, payload.input as Record<string, unknown>, {
      cwd: payload.cwd as string | undefined,
      home: payload.home as string | undefined,
    });
    if (verdict.block) {
      console.log(JSON.stringify({ block: true, rule: verdict.rule, reason: verdict.reason }));
      return 2;
    }
    return 0;
  }

  if (verb === "redact") {
    process.stdout.write(guardResult(await readStdin()));
    return 0;
  }

  console.error("uso: cli.ts check|redact (stdin)");
  return 64;
}

main()
  .then((code) => { process.exitCode = code; })
  .catch(() => {
    console.error("guard: erro interno");
    process.exitCode = 1;
  });
