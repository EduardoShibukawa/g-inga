import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");
const ULID = /^[0-9A-HJKMNP-TV-Z]{26}$/;

async function load<T>(rel: string): Promise<T | null> {
  try {
    return (await import(join(ROOT, rel))) as T;
  } catch {
    return null;
  }
}

type Emit = { emitEvent: (ev: Record<string, unknown>) => void };
type Val = {
  validateEvent: (ev: unknown) => { ok: boolean; errors: string[] };
};

const base = {
  v: 1,
  ts: "2026-10-27T14:02:11.204Z",
  source: "manda",
  kind: "attempt",
  id: "01JBX0000000000000000000AA",
  data: { runtime: "pi", passed: true },
};

let dir: string;
let file: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "ginga-events-"));
  file = join(dir, "events.jsonl");
});
afterEach(() => {
  delete process.env.GINGA_EVENTS;
  rmSync(dir, { recursive: true, force: true });
});

describe("emitEvent", () => {
  test("sem $GINGA_EVENTS não escreve nada", async () => {
    const mod = await load<Emit>("src/events/emit.ts");
    expect(mod).not.toBeNull();
    delete process.env.GINGA_EVENTS;
    mod!.emitEvent({ source: "ginga", kind: "transition", data: {} });
    expect(existsSync(file)).toBe(false);
  });

  test("com $GINGA_EVENTS faz append de 1 linha por evento, com v, ts ISO e id ULID", async () => {
    const mod = await load<Emit>("src/events/emit.ts");
    expect(mod).not.toBeNull();
    process.env.GINGA_EVENTS = file;
    writeFileSync(file, '{"linha":"preexistente"}\n');
    mod!.emitEvent({ source: "ginga", kind: "transition", data: { entity: "task", from: "a", to: "b", by: "system", via: "cli" } });
    mod!.emitEvent({ source: "ginga", kind: "transition", data: { entity: "task", from: "b", to: "c", by: "system", via: "cli" } });
    const lines = readFileSync(file, "utf8").split("\n").filter(Boolean);
    expect(lines.length).toBe(3);
    expect(JSON.parse(lines[0]!)).toEqual({ linha: "preexistente" });
    const ev = JSON.parse(lines[1]!);
    expect(ev.v).toBe(1);
    expect(ev.id).toMatch(ULID);
    expect(new Date(ev.ts).toISOString()).toBe(ev.ts);
    expect(JSON.parse(lines[2]!).id).not.toBe(ev.id);
    expect(lines[1]!.length).toBeLessThan(4096);
  });
});

describe("validateEvent", () => {
  test("aceita o envelope mínimo e campos desconhecidos", async () => {
    const mod = await load<Val>("src/events/validate.ts");
    expect(mod).not.toBeNull();
    expect(mod!.validateEvent(base).ok).toBe(true);
    expect(mod!.validateEvent({ ...base, campo_novo: 42 }).ok).toBe(true);
  });

  test("rejeita envelope sem v, ts, source, kind ou id", async () => {
    const mod = await load<Val>("src/events/validate.ts");
    expect(mod).not.toBeNull();
    for (const campo of ["v", "ts", "source", "kind", "id"]) {
      const ev: Record<string, unknown> = { ...base };
      delete ev[campo];
      const r = mod!.validateEvent(ev);
      expect(r.ok).toBe(false);
      expect(r.errors.join(" ")).toContain(campo);
    }
  });

  test("rejeita data inválida por kind", async () => {
    const mod = await load<Val>("src/events/validate.ts");
    expect(mod).not.toBeNull();
    const attempt = mod!.validateEvent({ ...base, data: { passed: "sim" } });
    expect(attempt.ok).toBe(false);
    const receipt = mod!.validateEvent({
      ...base,
      source: "pinga",
      kind: "receipt",
      data: { ledger_n: 1, hash: "abc", status: "talvez", check: "verify" },
    });
    expect(receipt.ok).toBe(false);
    const receiptOk = mod!.validateEvent({
      ...base,
      source: "pinga",
      kind: "receipt",
      data: { ledger_n: 1, hash: "abc", status: "pass", check: "verify" },
    });
    expect(receiptOk.ok).toBe(true);
    const transition = mod!.validateEvent({
      ...base,
      kind: "transition",
      data: { entity: "banana", from: "a", to: "b", by: "owner", via: "cli" },
    });
    expect(transition.ok).toBe(false);
  });
});

describe("schema e CLI", () => {
  test("schemas/events-v1.json é JSON e exige os cinco campos do envelope", () => {
    const p = join(ROOT, "schemas", "events-v1.json");
    expect(existsSync(p)).toBe(true);
    const schema = JSON.parse(readFileSync(p, "utf8"));
    expect([...schema.required].sort()).toEqual(
      expect.arrayContaining(["id", "kind", "source", "ts", "v"]),
    );
  });

  test("ginga events validate: exit 0 em arquivo válido, 1 com a linha do erro", () => {
    const ok = join(dir, "ok.jsonl");
    writeFileSync(ok, JSON.stringify(base) + "\n");
    const bad = join(dir, "bad.jsonl");
    writeFileSync(bad, JSON.stringify(base) + "\n" + JSON.stringify({ ...base, id: undefined }) + "\n");
    const run = (f: string) =>
      Bun.spawnSync(["bun", "bin/ginga.ts", "events", "validate", f], {
        cwd: ROOT,
        stdout: "pipe",
        stderr: "pipe",
      });
    expect(run(ok).exitCode).toBe(0);
    const r = run(bad);
    expect(r.exitCode).toBe(1);
    const text = r.stdout.toString() + r.stderr.toString();
    expect(text).toMatch(/\b2\b/); // número da linha inválida
    expect(text).toContain("id");
  });
});
