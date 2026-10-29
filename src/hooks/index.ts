// ginga hooks — fontes versionadas em <root>/.ginga/hooks/git/<hook> + <root>/.ginga/hooks.toml.
// Install: escreve o hook nos repos listados, encadeando (renomeando para <hook>.ginga-prev)
// qualquer hook pré-existente, e respeitando core.hooksPath. Idempotente.
// Check: sai 0 quando todos os repos têm o hook igual à fonte; 1 no drift, listando repo e hook.
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  renameSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";

export const HOOKS_DIRNAME = "hooks";
export const HOOKS_TOML = join(".ginga", "hooks.toml");
const HOOKS_SOURCE_DIRNAME = "hooks";
const HOOKS_GROUP = "git";
const PREV_SUFFIX = ".ginga-prev";

export type HooksConfig = {
  repos: string[];
  hooks: string[];
};

// Mini-parse de TOML suficiente para a forma própria do hooks.toml: seções
// simples e listas de strings curtas entre colchetes, com # comentários.
function parseHooksToml(raw: string): HooksConfig {
  const sections = new Map<string, Map<string, string>>();
  let section = "";
  for (const rawLine of raw.split(/\r?\n/)) {
    const hash = rawLine.indexOf("#");
    let line = hash < 0 ? rawLine : rawLine.slice(0, hash);
    line = line.trim();
    if (line === "") continue;
    const sec = /^\[([^\]]+)\]$/.exec(line);
    if (sec) {
      section = sec[1]!.trim();
      continue;
    }
    const kv = /^([^=]+)=(.*)$/.exec(line);
    if (!kv) continue;
    const key = kv[1]!.trim();
    const value = kv[2]!.trim();
    const map = sections.get(section) ?? new Map<string, string>();
    map.set(key, value);
    sections.set(section, map);
  }
  const git = sections.get(HOOKS_GROUP) ?? new Map<string, string>();
  return {
    repos: parseList(git.get("repos")),
    hooks: parseList(git.get("hooks")),
  };
}

function parseList(value: string | undefined): string[] {
  if (value === undefined || value === "") return [];
  const m = /^\[(.*)\]$/.exec(value);
  if (!m) return [];
  return m[1]!
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s !== "")
    .map((s) => {
      const q = /^(['"])(.*)\1$/.exec(s);
      return q ? q[2]! : s;
    });
}

export function loadHooksConfig(root: string): HooksConfig {
  const toml = join(root, HOOKS_TOML);
  const raw = readFileSync(toml, "utf8");
  const cfg = parseHooksToml(raw);
  if (cfg.repos.length === 0) throw new Error(`${toml}: nenhuma repos listada em [git]`);
  if (cfg.hooks.length === 0) throw new Error(`${toml}: nenhum hook listado em [git]`);
  return cfg;
}

export function sourceHookPath(root: string, hook: string): string {
  return join(root, ".ginga", HOOKS_SOURCE_DIRNAME, HOOKS_GROUP, hook);
}

// core.hooksPath é respeitado: se configurado (git config), instalamos lá;
// caminho relativo resolve contra a raiz do repo de trabalho.
export function resolveHooksDir(repoDir: string): string {
  let configured = "";
  let hadError = "";
  try {
    const r = Bun.spawnSync(["git", "-C", repoDir, "config", "--get", "core.hooksPath"], {
      stdout: "pipe",
      stderr: "pipe",
    });
    if (r.exitCode === 0) configured = r.stdout.toString().trim();
    if (r.exitCode !== 0 && (r.stderr?.toString() ?? "").trim() !== "") {
      hadError = r.stderr.toString().trim().split("\n")[0] ?? "";
    }
  } catch (e) {
    hadError = (e as Error).message;
  }
  if (configured !== "") {
    return isAbsolute(configured) ? configured : resolve(repoDir, configured);
  }
  if (hadError !== "") throw new Error(`git config em ${repoDir} falhou: ${hadError}`);
  return join(repoDir, ".git", "hooks");
}

type InstallOutcome = "unchanged" | "installed" | "chained";

function installHook(source: string, target: string): InstallOutcome {
  const golden = readFileSync(source, "utf8");
  if (existsSync(target) && statSync(target).isFile()) {
    const current = readFileSync(target, "utf8");
    if (current === golden) {
      chmodSync(target, 0o755); // idempotente: nada além do bit de execução
      return "unchanged";
    }
    // hook pré-existente (hk, lefthook, script): preserva e encadeia depois do nosso
    const prev = target + PREV_SUFFIX;
    rmSync(prev, { force: true });
    renameSync(target, prev);
  }
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, golden, { mode: 0o755 });
  chmodSync(target, 0o755);
  return existsSync(target + PREV_SUFFIX) ? "chained" : "installed";
}

export function hooksInstallCmd(args: string[]): number {
  const root = parseSubArgs(args, "install");
  if (root._error !== undefined) return usageError(root._error);
  let cfg: HooksConfig;
  try {
    cfg = loadHooksConfig(root._root);
  } catch (e) {
    console.error(`ginga hooks install: ${(e as Error).message}`);
    return 1;
  }
  let failed = false;
  for (const repo of cfg.repos) {
    const repoDir = join(root._root, repo);
    if (!existsSync(join(repoDir, ".git"))) {
      console.error(`ginga hooks install: ${repoDir} não é um repo git`);
      failed = true;
      continue;
    }
    let hooksDir: string;
    try {
      hooksDir = resolveHooksDir(repoDir);
    } catch (e) {
      console.error(`ginga hooks install: ${(e as Error).message}`);
      failed = true;
      continue;
    }
    for (const hook of cfg.hooks) {
      const source = sourceHookPath(root._root, hook);
      if (!existsSync(source)) {
        console.error(`ginga hooks install: fonte ausente: ${source}`);
        failed = true;
        continue;
      }
      const target = join(hooksDir, hook);
      try {
        const outcome = installHook(source, target);
        if (outcome === "chained") {
          console.log(`${repo}: ${hook}: instalado; hook pré-existente encadeado como ${hook}${PREV_SUFFIX}`);
        } else if (outcome === "installed") {
          console.log(`${repo}: ${hook}: instalado`);
        } else {
          console.log(`${repo}: ${hook}: já instalado, nada a fazer`);
        }
      } catch (e) {
        console.error(`ginga hooks install: ${repo}/${hook}: ${(e as Error).message}`);
        failed = true;
      }
    }
  }
  return failed ? 1 : 0;
}

export function hooksCheckCmd(args: string[]): number {
  const root = parseSubArgs(args, "check");
  if (root._error !== undefined) return usageError(root._error);
  let cfg: HooksConfig;
  try {
    cfg = loadHooksConfig(root._root);
  } catch (e) {
    console.error(`ginga hooks check: ${(e as Error).message}`);
    return 1;
  }
  const drift: Array<{ repo: string; hook: string; reason: string }> = [];
  for (const repo of cfg.repos) {
    const repoDir = join(root._root, repo);
    if (!existsSync(join(repoDir, ".git"))) {
      drift.push({ repo, hook: "*", reason: "não é um repo git" });
      continue;
    }
    let hooksDir: string;
    try {
      hooksDir = resolveHooksDir(repoDir);
    } catch (e) {
      drift.push({ repo, hook: "*", reason: (e as Error).message });
      continue;
    }
    for (const hook of cfg.hooks) {
      const source = sourceHookPath(root._root, hook);
      let golden: string;
      try {
        golden = readFileSync(source, "utf8");
      } catch {
        drift.push({ repo, hook, reason: "fonte ausente em .ginga/hooks/git" });
        continue;
      }
      const target = join(hooksDir, hook);
      if (!existsSync(target)) {
        drift.push({ repo, hook, reason: "hook ausente" });
        continue;
      }
      if (readFileSync(target, "utf8") !== golden) {
        drift.push({ repo, hook, reason: "diferente da fonte" });
      }
    }
  }
  if (drift.length > 0) {
    console.log("drift detectado (ginga hooks check):");
    for (const d of drift) console.log(`  ${d.repo}  ${d.hook}: ${d.reason}`);
    return 1;
  }
  console.log(`OK: ${cfg.hooks.length} hook(s) instalado(s) em ${cfg.repos.length} repo(s), igual à fonte`);
  return 0;
}

type SubResult = { _root: string; _error?: undefined } | { _root?: undefined; _error: string };

function parseSubArgs(args: string[], sub: string): SubResult {
  let rootArg: string | undefined;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === "--root") {
      const value = args[i + 1];
      if (value === undefined || value === "") return { _error: "--root sem caminho" };
      rootArg = value;
      i++;
      continue;
    }
    if (arg.startsWith("--root=")) {
      const value = arg.slice("--root=".length);
      if (value === "") return { _error: "--root sem caminho" };
      rootArg = value;
      continue;
    }
    return { _error: `argumento inesperado: ${arg}` };
  }
  if (rootArg === undefined) {
    const found = defaultRoot(process.cwd());
    if (found === undefined) {
      return { _error: `não encontrei ${HOOKS_TOML} a partir de ${process.cwd()} (use --root)` };
    }
    rootArg = found;
  }
  if (!existsSync(join(rootArg, HOOKS_TOML))) {
    return { _error: `ausente: ${join(rootArg, HOOKS_TOML)}` };
  }
  return { _root: rootArg };
}

function defaultRoot(start: string): string | undefined {
  let dir = resolve(start);
  for (;;) {
    if (existsSync(join(dir, HOOKS_TOML))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

function usageError(reason: string): number {
  console.error(`uso: ginga hooks ${subUsage}`);
  console.error(`  ${reason}`);
  return 2;
}

const subUsage = "install|check [--root PATH]";
