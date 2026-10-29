// Raiz do workspace e binários externos (PLAN-0015 TASK-03): o ginga não
// conhece caminhos de usuário. A raiz vem de $GINGA_WORKSPACE (vazio = não
// configurado) ou do ancestral mais próximo que tem `.ginga/`; sem nenhum,
// erro. Todo binário externo (pinga, gira, tuios, hermes, gum, fzf…) é
// resolvido pelo PATH no momento do uso — nunca gravado, nunca absoluto.

import { existsSync } from "node:fs";
import { dirname, join, parse, resolve } from "node:path";

/** `$GINGA_WORKSPACE` vence; senão sobe de `fromDir` até o `.ginga/` mais
 *  próximo; sem ancestral com `.ginga` → erro (configurar o env). */
export function findWorkspace(fromDir: string): string {
  const env = process.env.GINGA_WORKSPACE ?? "";
  if (env !== "") return env;
  let dir = resolve(fromDir);
  for (;;) {
    if (existsSync(join(dir, ".ginga"))) return dir;
    const { root } = parse(dir);
    if (dir === root) break;
    dir = dirname(dir);
  }
  throw new Error(`nenhum .ginga/ ancestral de ${fromDir} — defina GINGA_WORKSPACE`);
}

/** Onde está o binário `name` no PATH, ou null. Caminho calculado agora:
 *  nada de PATH congelado em código ou config. */
export function binary(name: string): string | null {
  return Bun.which(name) ?? null;
}
