import { lstatSync, mkdirSync, readlinkSync, symlinkSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * Link `~/.local/bin/ginga` -> entrypoint `bin/ginga.ts` do repositório.
 * Idempotente: symlink com o mesmo alvo fica intacto; alvo diferente é
 * recriado; arquivo regular NÃO é sobrescrito (avisa no stderr).
 */
export function ensureBinLink(
  home: string,
  envPath: string | undefined,
): { path: string; created: boolean; onPath: boolean } {
  const target = join(import.meta.dir, "..", "..", "bin", "ginga.ts");
  const link = join(home, ".local", "bin", "ginga");
  mkdirSync(dirname(link), { recursive: true });

  let created = false;
  let st: ReturnType<typeof lstatSync> | undefined;
  try {
    st = lstatSync(link);
  } catch {
    st = undefined;
  }
  if (st === undefined) {
    symlinkSync(target, link);
    created = true;
  } else if (st.isSymbolicLink()) {
    if (readlinkSync(link) !== target) {
      unlinkSync(link);
      symlinkSync(target, link);
      created = true;
    }
  } else {
    console.error(
      `aviso: ${link} já existe como arquivo regular: link não criado`,
    );
  }

  const binDir = dirname(link);
  const onPath = (envPath ?? "").split(":").includes(binDir);
  return { path: link, created, onPath };
}
