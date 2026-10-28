import { createHash } from "node:crypto";
import { ADAPTER_ORDER, pickSource, pickPlugin } from "./install/index.ts";

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
  const plugin = pickPlugin(env, cwd);

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

  if (json) {
    console.log(JSON.stringify(records));
  } else {
    for (const r of records) {
      console.log(`${r.status} ${r.harness}/${r.check}: ${r.detail}`);
    }
  }

  if (broken) return 1;
  return 0;
}
