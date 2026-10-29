import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { installCmd } from "../../src/install";
import { Supervisor } from "../../src/supervisor.ts";
import { makeRealisticHome } from "./helpers/home";

describe("PLAN-0023 follow-up 2", () => {
  test("install copia ginga-supervisor.service para HOME falso", async () => {
    const f = makeRealisticHome();
    try {
      const code = await installCmd({ mode: "apply", home: f.home, adapters: [], env: f.env });
      expect(code).toBe(0);
      const dst = join(f.home, ".config", "systemd", "user", "ginga-supervisor.service");
      expect(existsSync(dst)).toBe(true);
      expect(readFileSync(dst, "utf8")).toContain("ginga serve");
    } finally {
      rmSync(f.home, { recursive: true, force: true });
      rmSync(f.state, { recursive: true, force: true });
      rmSync(f.tmpdir, { recursive: true, force: true });
      rmSync(f.source, { recursive: true, force: true });
    }
  });

  test("supervisor emite lane.round phase end com reason no_pending quando sem pendência", async () => {
    const dir = realpathSync(mkdtempSync(join(realpathSync(tmpdir()), "sup-")));
    const events: any[] = [];
    const sup = new Supervisor([{ repo: "PLAN", command: "echo ok", cwd: dir }], {
      root: dir,
      pendingCheck: async () => false,
      emit: (e: any) => events.push(e),
    });
    await sup.run();
    const ev = events.find((e) => e.kind === "lane.round" && e.data?.phase === "end");
    expect(ev).toBeTruthy();
    expect(ev.data.reason).toBe("no_pending");
    rmSync(dir, { recursive: true, force: true });
  });
});
