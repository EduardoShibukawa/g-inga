import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { mkdtempSync, rmSync, writeFileSync, readFileSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";

let supModule: any = null;
try {
  supModule = await import("../src/supervisor.ts");
} catch (e) {
  supModule = null;
}

describe("supervisor module", () => {
  test("exporta Supervisor/supervise", () => {
    expect(supModule).not.toBeNull();
    expect(typeof supModule.Supervisor).toBe("function");
    expect(typeof supModule.supervise).toBe("function");
  });

  test("backoff crescente em falha e parada sem pendência", async () => {
    if (!supModule) { expect(supModule).not.toBeNull(); return; }
    const dir = realpathSync(mkdtempSync(join(realpathSync(tmpdir()), "sup-")));
    const logFile = join(dir, "runs.log");
    let pending = true;
    let n = 0;
    const cmd = `echo run >> ${logFile}; n=$(cat ${dir}/n 2>/dev/null || echo 0); n=$((n+1)); echo $n > ${dir}/n; if [ "$n" -lt 3 ]; then exit 1; fi; exit 0`;
    const sup = new supModule.Supervisor([{ repo: "PLAN", command: cmd, cwd: dir }], {
      root: dir,
      backoffBaseMs: 10,
      backoffMaxMs: 100,
      maxRestarts: 5,
      pendingCheck: async () => pending,
      sleep: async (ms: number) => { await new Promise((r) => setTimeout(r, ms)); },
    });
    // stop after first success
    const origRun = sup.run.bind(sup);
    // monkey: wrap runLane? Instead set pending false after 3 runs via polling
    const poll = setInterval(() => {
      try {
        const c = readFileSync(join(dir, "n"), "utf8").trim();
        if (Number(c) >= 3) { pending = false; clearInterval(poll); }
      } catch {}
    }, 5);
    const res = await sup.run();
    clearInterval(poll);
    rmSync(dir, { recursive: true, force: true });
    expect(res.length).toBe(1);
    expect(res[0].runs).toBeGreaterThanOrEqual(3);
  });

  test("parada sem pendência não executa comando", async () => {
    if (!supModule) { expect(supModule).not.toBeNull(); return; }
    const dir = realpathSync(mkdtempSync(join(realpathSync(tmpdir()), "sup2-")));
    const queueFile = join(dir, "queue.json");
    writeFileSync(queueFile, JSON.stringify({ tasks: [] }));
    let called = 0;
    const cmd = `echo called >> ${dir}/called.log; exit 0`;
    const sup = new supModule.Supervisor([{ repo: "PLAN", command: cmd, cwd: dir }], {
      root: dir,
      maxRestarts: 1,
      queueCommand: `cat ${queueFile}`,
    });
    await sup.run();
    const calledLog = join(dir, "called.log");
    let content = "";
    try { content = readFileSync(calledLog, "utf8"); } catch {}
    expect(content).toBe("");
    rmSync(dir, { recursive: true, force: true });
  });
});
