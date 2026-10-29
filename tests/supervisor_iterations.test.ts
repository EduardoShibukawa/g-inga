import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { mkdtempSync, rmSync, readFileSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";

describe("supervisor sem cap de 10 iterações", () => {
  test("roda mais de 10 iterações quando pendência persiste", async () => {
    const mod: any = await import("../src/supervisor.ts");
    const dir = realpathSync(mkdtempSync(join(realpathSync(tmpdir()), "supcap-")));
    const logFile = join(dir, "n");
    let pending = true;
    const cmd = `n=$(cat ${logFile} 2>/dev/null || echo 0); n=$((n+1)); echo $n > ${logFile}; exit 0`;
    const sup = new mod.Supervisor([{ repo: "PLAN", command: cmd, cwd: dir }], {
      root: dir,
      backoffBaseMs: 1,
      backoffMaxMs: 1,
      maxRestarts: 100,
      pendingCheck: async () => pending,
      sleep: async () => {},
    });
    const poll = setInterval(() => {
      try {
        const c = readFileSync(logFile, "utf8").trim();
        if (Number(c) >= 15) { pending = false; clearInterval(poll); }
      } catch {}
    }, 1);
    const res = await sup.run();
    clearInterval(poll);
    rmSync(dir, { recursive: true, force: true });
    expect(res[0].runs).toBeGreaterThanOrEqual(15);
  });
});
