import { createHash } from "node:crypto";
import { ADAPTER_ORDER, pickSource, pickPlugin } from "./install/index.ts";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { HOOKS_TOML, hooksDrift, type HooksDrift } from "./hooks/index.ts";
import { binary } from "./workspace.ts";
import { DEFAULT_COMMANDS } from "./tick.ts";
import { DEFAULT_LEDGER } from "./verbs/ledger.ts";

type DoctorRecord = {
  harness: string;
  check: string;
  status: "ok" | "degraded" | "broken" | "unverified";
  law2: "pass" | "fail" | "blocked" | "not run";
  cmd: string[] | null;
  exit: number | null;
  stdout_sha256: string | null;
  duration_ms: number | null;
  detail: string;
};

function sha256hex(data: string): string {
  return createHash("sha256").update(data).digest("hex");
}

function isFiltered(harness: string, only?: string): boolean {
  return only !== undefined && only !== harness;
}

function filteredRecord(harness: string): DoctorRecord {
  return {
    harness,
    check: "probe",
    status: "unverified",
    law2: "not run",
    cmd: null,
    exit: null,
    stdout_sha256: null,
    duration_ms: null,
    detail: "filtrado por --only",
  };
}

// Versões (PLAN-0015 TASK-05): `ginga doctor` roda `--version --json` de cada
// binário do homelab e confere a faixa semver declarada em `gingaCompat` no
// package.json do ginga (só ">=X.Y.Z"; parser próprio, sem dependências).
// pinga e manda são obrigatórios; gira é opcional — ausência e problema de
// versão nele são aviso, nunca erro.
const VERSION_BINS: Array<{ bin: string; required: boolean }> = [
  { bin: "pinga", required: true },
  { bin: "manda", required: true },
  { bin: "gira", required: false },
];

function parseSemver(s: unknown): number[] | null {
  if (typeof s !== "string") return null;
  const m = /^\s*v?(\d+)\.(\d+)\.(\d+)/.exec(s);
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function semverLt(a: number[], b: number[]): boolean {
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i]! < b[i]!;
  return false;
}

function gingaCompat(): Record<string, unknown> {
  try {
    const pkg = JSON.parse(readFileSync(join(import.meta.dir, "..", "package.json"), "utf8"));
    const c = pkg?.gingaCompat;
    return c && typeof c === "object" ? (c as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function versionProbe(spec: { bin: string; required: boolean }, compat: Record<string, unknown>): DoctorRecord {
  const t0 = Date.now();
  const mk = (
    status: DoctorRecord["status"],
    law2: DoctorRecord["law2"],
    cmd: string[] | null,
    exit: number | null,
    stdout: string | null,
    detail: string,
  ): DoctorRecord => ({
    harness: spec.bin,
    check: "version",
    status,
    law2,
    cmd,
    exit,
    stdout_sha256: stdout === null ? null : sha256hex(stdout),
    duration_ms: Date.now() - t0,
    detail,
  });

  const bin = binary(spec.bin);
  if (bin === null) return mk("unverified", "blocked", null, null, null, `${spec.bin} ausente do PATH`);

  const cmd = [bin, "--version", "--json"];
  const res = Bun.spawnSync(cmd, { timeout: 5000, stdout: "pipe", stderr: "pipe" });
  const exit = res.exitCode ?? null;
  const stdout = res.stdout?.toString() ?? "";
  // Resposta inválida é aviso, não erro: obrigatório fica unverified/blocked
  // (o pinga real não tem `--version`); opcional fica degraded/fail.
  const invalid = (why: string) =>
    spec.required ? mk("unverified", "blocked", cmd, exit, stdout, why) : mk("degraded", "fail", cmd, exit, stdout, why);

  if ((res as any).exitedDueToTimeout === true || exit === null) {
    return invalid(`timeout: ${spec.bin} sem resposta em --version --json`);
  }
  if (exit !== 0) return invalid(`${spec.bin}: --version --json saiu com exit ${exit}`);

  let payload: any;
  try {
    payload = JSON.parse(stdout);
  } catch {
    return invalid(`${spec.bin}: saída de --version --json não é JSON`);
  }
  const ver = parseSemver(payload?.version);
  if (!ver) return invalid(`${spec.bin}: resposta de --version --json sem "version" semver`);

  const range = compat[spec.bin];
  const m = typeof range === "string" ? /^\s*>=\s*(.+)$/.exec(range) : null;
  const min = parseSemver(m?.[1]);
  if (!min) {
    return invalid(`gingaCompat.${spec.bin}: faixa ausente ou não reconhecida (esperado ">=X.Y.Z")`);
  }
  if (semverLt(ver, min)) {
    return spec.required
      ? mk("broken", "fail", cmd, exit, stdout, `${spec.bin} ${payload.version} fora da faixa ${range}`)
      : mk("degraded", "fail", cmd, exit, stdout, `${spec.bin} ${payload.version} fora da faixa ${range} (opcional)`);
  }
  return mk("ok", "pass", cmd, exit, stdout, `${spec.bin} ${payload.version} na faixa ${range}`);
}

/**
 * T920: confere os `[commands]` do condutor (padrões + project.toml do cwd).
 * Binário ausente do PATH é aviso — unverified/blocked, sem mexer no exit.
 */
function commandsRecord(cwd: string): DoctorRecord {
  const started = Date.now();
  const commands: Record<string, string> = { ...DEFAULT_COMMANDS, ledger: DEFAULT_LEDGER };
  delete commands.dispatch; // mesmo comando de `run`
  let raw = "";
  try {
    raw = readFileSync(join(cwd, ".ginga", "project.toml"), "utf8");
  } catch {
    // sem project.toml: valem os padrões
  }
  let section = "";
  for (const line of raw.split("\n")) {
    const head = line.match(/^\s*\[([^\]]+)\]\s*$/);
    if (head) {
      section = head[1]!.trim();
      continue;
    }
    const kv = section === "commands" ? line.match(/^\s*([A-Za-z0-9_-]+)\s*=\s*"(.*)"\s*$/) : null;
    if (kv && kv[1]! in commands) commands[kv[1]!] = kv[2]!;
  }
  const missing = new Map<string, string[]>();
  for (const [key, command] of Object.entries(commands)) {
    const bin = command.trim().split(/\s+/)[0] ?? "";
    if (bin === "" || bin === "builtin" || bin === "none") continue;
    const found = bin.includes("/") ? existsSync(bin) : Bun.which(bin) !== null;
    if (!found) missing.set(bin, [...(missing.get(bin) ?? []), key]);
  }
  const ok = missing.size === 0;
  return {
    harness: "ginga",
    check: "commands",
    status: ok ? "ok" : "unverified",
    law2: ok ? "pass" : "blocked",
    cmd: null,
    exit: null,
    stdout_sha256: null,
    duration_ms: Date.now() - started,
    detail: ok
      ? "binários dos [commands] no PATH"
      : `fora do PATH: ${[...missing].map(([bin, keys]) => `${bin} (${keys.join(", ")})`).join("; ")}`,
  };
}

export function doctorCmd(args: string[]): number {
  const env = process.env;
  const cwd = process.cwd();

  let json = false;
  let only: string | undefined;
  let home: string | undefined;
  let manifestPath: string | undefined;
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a === "--json") {
      json = true;
    } else if (a === "--only") {
      only = args[++i];
    } else if (a === "--home") {
      home = args[++i];
    } else if (a === "--manifest") {
      manifestPath = args[++i];
    } else {
      console.error("uso: ginga doctor [--json] [--only H] [--home P] [--manifest PATH]");
      return 2;
    }
  }

  if (only !== undefined && !ADAPTER_ORDER.includes(only as any)) {
    console.error(`--only inválido: ${only}`);
    return 2;
  }

  let source: string;
  try {
    source = pickSource(env, cwd);
  } catch (e) {
    console.error((e as Error).message);
    return 2;
  }
  const plugin = (() => {
    try {
      return pickPlugin(env, cwd);
    } catch {
      return ""; // sem plugin nomeado; o nome só entra nos details do claude
    }
  })();

  const resolvedHome = home ?? env.HOME;
  if (!resolvedHome) {
    console.error("HOME não definido");
    return 2;
  }

  const records: DoctorRecord[] = [];
  let broken = false;

  for (const harness of ADAPTER_ORDER) {
    if (isFiltered(harness, only)) {
      records.push(filteredRecord(harness));
      continue;
    }
    if (harness !== "claude") {
      records.push({
        harness,
        check: "probe",
        status: "unverified",
        law2: "not run",
        cmd: null,
        exit: null,
        stdout_sha256: null,
        duration_ms: 0,
        detail: "não implementado no ginga doctor",
      });
      continue;
    }

    // plugin list
    const t0 = Date.now();
    const bin = (Bun as any).which ? (Bun as any).which("claude", { PATH: env.PATH ?? "" }) : null;
    if (bin === null) {
      records.push({
        harness: "claude",
        check: "plugin_list",
        status: "unverified",
        law2: "blocked",
        cmd: null,
        exit: null,
        stdout_sha256: null,
        duration_ms: Date.now() - t0,
        detail: "claude ausente",
      });
    } else {
      const res = Bun.spawnSync([bin, "plugin", "list"], {
        cwd: resolvedHome,
        timeout: 5000,
        env: { ...env, HOME: resolvedHome } as any,
        stdout: "pipe",
        stderr: "pipe",
      });
      const stdout = res.stdout?.toString() ?? "";
      const exit = res.exitCode ?? null;
      const timedOut = (res as any).exitedDueToTimeout === true;
      const duration = Date.now() - t0;
      let status: DoctorRecord["status"] = "broken";
      let detail = "";
      if (timedOut || exit === null) {
        status = "unverified";
        detail = `timeout: probe sem resposta`;
      } else if (exit !== 0) {
        status = "broken";
        detail = `plugin list exit ${exit}`;
      } else if (stdout.trim() === "") {
        status = "degraded";
        detail = `exit 0 com saída vazia em plugin_list`;
      } else {
        const key = `${plugin}@${plugin}-local`;
        const lines = stdout.split(/\r?\n/);
        const start = lines.findIndex((l) => l.includes(key));
        if (start === -1) {
          status = "degraded";
          detail = `plugin ${plugin} ausente em plugin list`;
        } else {
          let end = start + 1;
          while (end < lines.length && lines[end]!.trim() !== "") end++;
          const block = lines.slice(start, end).join("\n");
          if (block.includes("disabled")) {
            status = "degraded";
            detail = `plugin ${plugin} desabilitado`;
          } else {
            status = "ok";
            detail = `plugin ${plugin} habilitado`;
          }
        }
      }
      const law2 = status === "ok" ? "pass" : status === "degraded" || status === "broken" ? "fail" : "blocked";
      if (status === "broken") broken = true;
      records.push({
        harness: "claude",
        check: "plugin_list",
        status,
        law2,
        cmd: [bin, "plugin", "list"],
        exit,
        stdout_sha256: sha256hex(stdout),
        duration_ms: duration,
        detail,
      });
    }

    // plugin validate
    const t1 = Date.now();
    const bin2 = (Bun as any).which ? (Bun as any).which("claude", { PATH: env.PATH ?? "" }) : null;
    if (bin2 === null) {
      records.push({
        harness: "claude",
        check: "plugin_validate",
        status: "unverified",
        law2: "blocked",
        cmd: null,
        exit: null,
        stdout_sha256: null,
        duration_ms: Date.now() - t1,
        detail: "claude ausente",
      });
    } else {
      const res = Bun.spawnSync([bin2, "plugin", "validate", source], {
        cwd: resolvedHome,
        timeout: 5000,
        env: { ...env, HOME: resolvedHome } as any,
        stdout: "pipe",
        stderr: "pipe",
      });
      const stdout = res.stdout?.toString() ?? "";
      const exit = res.exitCode ?? null;
      const duration = Date.now() - t1;
      const status = exit === 0 ? "ok" : "broken";
      if (status === "broken") broken = true;
      records.push({
        harness: "claude",
        check: "plugin_validate",
        status,
        law2: status === "ok" ? "pass" : "fail",
        cmd: [bin2, "plugin", "validate", source],
        exit,
        stdout_sha256: sha256hex(stdout),
        duration_ms: duration,
        detail: status === "ok" ? "validação do plugin passou" : `plugin validate exit ${exit}`,
      });
    }
  }

  // versões: um registro `harness=<bin>, check="version"` por binário do
  // homelab (pinga, manda obrigatórios; gira opcional). Com --only a seleção
  // é só de adapters, então os probes não rodam e não registram nada.
  if (only === undefined) {
    const compat = gingaCompat();
    for (const spec of VERSION_BINS) {
      const rec = versionProbe(spec, compat);
      if (rec.status === "broken") broken = true;
      records.push(rec);
    }
  }

  // commands (T920): os binários que o condutor chama por `[commands]`.
  if (only === undefined) records.push(commandsRecord(cwd));

  // hooks_drift (ginga): acusa drift dos hooks instalados pelo `ginga hooks install`
  // na raiz do cwd (com hooks.toml). Sem hooks.toml: unverified/blocked, sem
  // mexer no exit; com drift: broken/fail e o doctor sai 1, como o plugin quebrado.
  const tHooks = Date.now();
  let hooksRecord: DoctorRecord;
  if (!existsSync(join(cwd, HOOKS_TOML))) {
    hooksRecord = {
      harness: "ginga",
      check: "hooks_drift",
      status: "unverified",
      law2: "blocked",
      cmd: null,
      exit: null,
      stdout_sha256: null,
      duration_ms: Date.now() - tHooks,
      detail: "hooks.toml ausente",
    };
  } else {
    let drift: HooksDrift[];
    try {
      drift = hooksDrift(cwd);
    } catch (e) {
      drift = [{ repo: cwd, hook: "*", reason: (e as Error).message }];
    }
    if (drift.length === 0) {
      hooksRecord = {
        harness: "ginga",
        check: "hooks_drift",
        status: "ok",
        law2: "pass",
        cmd: null,
        exit: null,
        stdout_sha256: null,
        duration_ms: Date.now() - tHooks,
        detail: "sem drift",
      };
    } else {
      broken = true;
      hooksRecord = {
        harness: "ginga",
        check: "hooks_drift",
        status: "broken",
        law2: "fail",
        cmd: null,
        exit: null,
        stdout_sha256: null,
        duration_ms: Date.now() - tHooks,
        detail: `${drift.length} drift(s): ${drift.map((d) => `${d.repo} ${d.hook} ${d.reason}`).join("; ")}`,
      };
    }
  }
  records.push(hooksRecord);

  if (json) {
    console.log(JSON.stringify({ schema_version: 1, records }));
  } else {
    for (const r of records) {
      console.log(`${r.status} ${r.harness}/${r.check}: ${r.detail}`);
    }
  }

  if (broken) return 1;
  return 0;
}
