import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { validateEvent } from "../src/events/validate.ts";

/**
 * PLAN-0023 TASK-01: o schema v1 ganha os kinds do vigia —
 * heartbeat{entity,pid,progress}, lane.round{lane,phase}, gate.result{plan,repo,code},
 * alvo.check{check,ok} — e as fixtures dos 6 incidentes do PLAN-0023 passam no
 * validateEvent (JSONL completo: v, ts, source, kind, id).
 */

const nova1 = "01JABCDEFGHJKMNPQRSTVWXYZ1";

const env = (kind: string, data: object): any => ({
  v: 1,
  ts: "2026-10-28T12:00:00.000Z",
  source: "test",
  kind,
  id: nova1,
  data,
});

describe("kinds do vigia no schema v1", () => {
  test("heartbeat válido aceito; sem progress/pid/entity nem tipos errados rejeitados", () => {
    expect(validateEvent(env("heartbeat", { entity: "executor/beam-free", pid: 123, progress: 7 })).ok).toBe(true);
    const semProgress = validateEvent(env("heartbeat", { entity: "lane/ginga", pid: 1 }));
    expect(semProgress.ok).toBe(false);
    const pidString = validateEvent(env("heartbeat", { entity: "lane/ginga", pid: "x", progress: 1 }));
    expect(pidString.ok).toBe(false);
    const aliveErrado = validateEvent(env("heartbeat", { entity: "lane/ginga", pid: 1, progress: 1, alive: "sim" }));
    expect(aliveErrado.ok).toBe(false);
  });

  test("lane.round: phase é enum start|end; sem lane/phase rejeitado", () => {
    expect(validateEvent(env("lane.round", { lane: "ginga", phase: "start" })).ok).toBe(true);
    const phaseErrada = validateEvent(env("lane.round", { lane: "ginga", phase: "pause" }));
    expect(phaseErrada.ok).toBe(false);
    const semPhase = validateEvent(env("lane.round", { lane: "ginga" }));
    expect(semPhase.ok).toBe(false);
  });

  test("gate.result: code é número; sem plan/repo/code rejeitado", () => {
    expect(validateEvent(env("gate.result", { plan: "PLAN-0023", repo: "ginga", code: 0 })).ok).toBe(true);
    const codeString = validateEvent(env("gate.result", { plan: "PLAN-0023", repo: "ginga", code: "0" }));
    expect(codeString.ok).toBe(false);
    const semCode = validateEvent(env("gate.result", { plan: "PLAN-0023", repo: "ginga" }));
    expect(semCode.ok).toBe(false);
  });

  test("alvo.check: ok é boolean; sem check/ok rejeitado", () => {
    expect(validateEvent(env("alvo.check", { check: "receipts_done", ok: true })).ok).toBe(true);
    const okString = validateEvent(env("alvo.check", { check: "receipts_done", ok: "true" }));
    expect(okString.ok).toBe(false);
    const semOk = validateEvent(env("alvo.check", { check: "receipts_done" }));
    expect(semOk.ok).toBe(false);
  });

  test("campos desconhecidos de data continuam ignorados; envelope id é ULID", () => {
    const ok = validateEvent(env("heartbeat", { entity: "x", pid: 1, progress: 0, extra: "ignorado", cpu_pct: 3, alive: true }));
    expect(ok.ok).toBe(true);
    const badUlid = validateEvent({ ...env("heartbeat", { entity: "x", pid: 1, progress: 0 }), id: "não-ulid" });
    expect(badUlid.ok).toBe(false);
  });
});

describe("fixtures dos 6 incidentes (tests/fixtures/watch)", () => {
  const INCIDENTES = [
    "no_progress.jsonl",
    "lane_dead.jsonl",
    "main_moved_outside_gate.jsonl",
    "judge_shopping.jsonl",
    "report_mismatch.jsonl",
    "goal_reached.jsonl",
  ];
  const FIX = join(import.meta.dir, "fixtures", "watch");

  const read = (f: string): any[] =>
    readFileSync(join(FIX, f), "utf8")
      .trim()
      .split("\n")
      .filter((l) => l.trim() !== "")
      .map((l) => JSON.parse(l));

  test("os 6 arquivos existem em tests/fixtures/watch", () => {
    const have = new Set(readdirSync(FIX));
    for (const f of INCIDENTES) expect(have.has(f)).toBe(true);
  });

  test("cada linha de cada fixture é um evento v1 válido (validateEvent ok)", () => {
    for (const f of INCIDENTES) {
      const lines = read(f);
      expect(lines.length).toBeGreaterThan(0);
      for (const [i, line] of lines.entries()) {
        const r = validateEvent(line);
        if (!r.ok) throw new Error(`${f}:${i + 1} inválido: ${r.errors.join("; ")}`);
      }
    }
  });

  test("cada fixture ilustra o seu incidente", () => {
    expect(read("no_progress.jsonl").some((e: any) => e.kind === "heartbeat")).toBe(true);
    expect(
      read("lane_dead.jsonl").some((e: any) => e.kind === "lane.round" && e.data.phase === "start"),
    ).toBe(true);
    // main moved SEM gate.result: a fixture não tem gate.result (e demais sim)
    expect(read("main_moved_outside_gate.jsonl").some((e: any) => e.kind === "gate.result")).toBe(false);
    expect(read("judge_shopping.jsonl").some((e: any) => e.kind === "receipt")).toBe(true);
    expect(read("report_mismatch.jsonl").some((e: any) => e.kind === "receipt")).toBe(true);
    expect(read("goal_reached.jsonl").some((e: any) => e.kind === "gate.result" && e.data.code === 0)).toBe(true);
  });
});
