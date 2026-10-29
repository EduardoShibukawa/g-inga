// Verbo `init` do registro (write): cria `.ginga/` + `project.toml` a partir
// do que detecta no repo, sem sobrescrever nada. `--yes` não pergunta; sem
// `--yes` mostra o TOML proposto e pede confirmação. A pergunta é só da CLI:
// via API (via != "cli") não há terminal — sem `--yes` devolve criado=false
// em vez de travar lendo stdin do servidor.

import { readSync } from "node:fs";
import { dirname } from "node:path";
import type { VerbArgs, VerbCtx } from "./registry.ts";
import { createBundle, detectContract, renderProjectToml } from "../init.ts";

const CONFIRM = /^(y|yes|s|sim)$/i;

/**
 * Lê a primeira linha do stdin (pipe ou terminal). EOF, stdin fechado ou
 * erro viram recusa; só `y/yes/s/sim` confirmam.
 */
function askConfirmation(): boolean {
  const buf = Buffer.alloc(256);
  let acc = "";
  for (let tries = 0; tries < 64; tries++) {
    let n = 0;
    try {
      n = readSync(0, buf, 0, buf.length, null);
    } catch {
      break;
    }
    if (n <= 0) break;
    acc += buf.toString("utf8", 0, n);
    if (acc.includes("\n")) break;
  }
  const answer = acc.split(/\r?\n/, 1)[0]!.trim();
  return answer !== "" && CONFIRM.test(answer);
}

export function run(ctx: VerbCtx, args: VerbArgs): unknown {
  const repo = dirname(ctx.root); // default: <cwd>/.ginga → <cwd>
  const contract = detectContract(repo);
  const toml = renderProjectToml(contract);

  if ((args.yes ?? "").trim() === "") {
    console.log(toml);
    if (ctx.via !== "cli") {
      return { root: ctx.root, created: false, reason: "sem --yes e sem terminal (via != cli): nada criado" };
    }
    process.stdout.write("criar .ginga/ com este project.toml? [y/N] ");
    if (!askConfirmation()) {
      console.log("não confirmado — nada criado.");
      return { root: ctx.root, created: false, reason: "recusado na confirmação" };
    }
  }

  const created = createBundle(ctx.root, contract);
  return {
    root: ctx.root,
    repo,
    created,
    detected: {
      test: contract.test,
      provider: contract.provider,
      runtimes: contract.runtimes.map((r) => r.name),
      notify: contract.notify,
    },
  };
}
