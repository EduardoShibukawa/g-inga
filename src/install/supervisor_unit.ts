import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { ensureBinLink } from "./binlink.ts";

/**
 * `ginga install --supervisor [--enable]`: só a unit systemd do supervisor
 * (`contrib/systemd/ginga-supervisor.service` -> `~/.config/systemd/user/`)
 * e o link `~/.local/bin/ginga`. Não lê nem grava manifest, não toca
 * adaptadores (claude/opencode/pi/hermes/tuios).
 */
export async function installSupervisorCmd(opts: {
  home: string;
  env?: Record<string, string | undefined>;
  enable?: boolean;
  systemctl?: (args: string[]) => Promise<number>;
}): Promise<number> {
  const env = opts.env ?? process.env;

  // Unit do supervisor: caminho relativo a import.meta.dir, como em install.ts.
  const unitSrc = join(
    import.meta.dir,
    "..",
    "..",
    "contrib",
    "systemd",
    "ginga-supervisor.service",
  );
  const unitDst = join(
    opts.home,
    ".config",
    "systemd",
    "user",
    "ginga-supervisor.service",
  );
  mkdirSync(dirname(unitDst), { recursive: true });
  writeFileSync(unitDst, readFileSync(unitSrc));

  // Link ~/.local/bin/ginga -> entrypoint do repo.
  const link = ensureBinLink(opts.home, env.PATH);
  if (!link.onPath) console.error("aviso: ~/.local/bin não está no PATH");

  const systemctl =
    opts.systemctl ??
    (async (args: string[]): Promise<number> => {
      const bin = env.GINGA_SYSTEMCTL ?? "systemctl";
      const proc = Bun.spawn([bin, ...args], {
        stdout: "inherit",
        stderr: "inherit",
      });
      return await proc.exited;
    });

  let code = await systemctl(["--user", "daemon-reload"]);
  if (code !== 0) return code;
  if (opts.enable) {
    code = await systemctl([
      "--user",
      "enable",
      "--now",
      "ginga-supervisor.service",
    ]);
    if (code !== 0) return code;
  }
  return 0;
}
