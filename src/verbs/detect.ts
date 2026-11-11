// Verbo `detect` (T917, leitura): o que o `ginga init` leria deste projeto e
// o project.toml que ele proporia — sem criar nada. Alimenta a tela
// Onboarding; criar continua sendo o verbo `init`.

import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { detectContract, renderProjectToml } from "../init.ts";
import type { VerbCtx } from "./registry.ts";

export function detect(ctx: VerbCtx): unknown {
  const contract = detectContract(dirname(ctx.root)); // <repo>/.ginga → <repo>
  return {
    bundle: { exists: existsSync(ctx.root), project_toml: existsSync(join(ctx.root, "project.toml")) },
    detected: {
      test: contract.test,
      provider: contract.provider,
      runtimes: contract.runtimes,
      notify: contract.notify,
    },
    toml: renderProjectToml(contract),
  };
}
