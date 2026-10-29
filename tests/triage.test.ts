import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validateEvent } from "../src/events/validate";
import { openStateDb } from "../src/state/db";
import { triage } from "../src/triage";
import { getVerb, runVerb, type VerbCtx } from "../src/verbs/registry";

/**
 * PLAN-0011 TASK-07: triagem que só promove (doc 02 §4/§5).
 * - `triage({flag?, files?, impact?, newContract?}) → {track: "feature" | "small", reasons: string[]}` (src/triage.ts),
 *   determinística e sem LLM. Regras (na dúvida → feature):
 *     flag "feature" → feature; contrato novo → feature; files > 3 → feature; impact > 5 → feature;
 *     flag "small" sem nenhuma evidência contrária → small; sem flag, files conhecido (≤ 3) e impact ausente ou ≤ 5 → small;
 *     sem nenhuma informação → feature. `flag: "small"` NUNCA rebaixa uma evidência de feature.
 * - `intent new` aceita os args opcionais `track` (flag), `files`, `impact`, `contract` ("true"), roda a triagem e grava
 *   `track: small|feature` no frontmatter do INTENT; o resultado do verbo ganha `track` e `reasons`.
 *   `files`/`impact` não numéricos → erro que cita o nome do argumento.
 * - Verbo `triage promote <plan>` (write): PLAN sem `spec:` (trilha pequena) → cria `specs/SPEC-NNNN-<slug>.md` draft
 *   (type spec, title do PLAN, intent do PLAN, status draft, bench none), liga `spec:` no PLAN.md, linha no log.md
 *   (by/via) e evento transition {entity: plan, from: small, to: feature}. PLAN que já tem `spec:` → erro; sem PLAN → erro.
 *   Não existe `triage demote`: é verbo desconhecido.
 */

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  delete process.env.GINGA_EVENTS;
});

let dir: string;
let root: string;
let ctx: VerbCtx;
let eventsPath: string;

beforeEach(() => {
  dir = realpathSync(mkdtempSync(join(realpathSync(tmpdir()), "ginga-triage-")));
  dirs.push(dir);
  root = join(dir, "bundle");
  mkdirSync(join(root, "intents"), { recursive: true });
  mkdirSync(join(root, "specs"), { recursive: true });
  mkdirSync(join(root, "plans", "PLAN-0001-auth"), { recursive: true });
  writeFileSync(join(root, "intents", "INTENT-0001-primeiro.md"), "---\ntype: intent\ntitle: Primeiro\nsource: cli\ntimestamp: 2026-10-27T00:00:00Z\n---\nCorpo.\n");
  writeFileSync(join(root, "specs", "SPEC-0001-outra.md"), "---\ntype: spec\ntitle: Outra\nintent: INTENT-0001-primeiro\nstatus: draft\nbench: none\n---\n## Objetivo\nx\n");
  writeFileSync(
    join(root, "plans", "PLAN-0001-auth", "PLAN.md"),
    "---\ntype: plan\ntitle: Auth plan\nintent: INTENT-0001-primeiro\nstatus: draft\n---\n## Objetivo\nx\n",
  );
  writeFileSync(join(root, "plans", "PLAN-0001-auth", "log.md"), "# Log — PLAN-0001\n");
  mkdirSync(join(root, "plans", "PLAN-0002-grande"), { recursive: true });
  writeFileSync(
    join(root, "plans", "PLAN-0002-grande", "PLAN.md"),
    "---\ntype: plan\ntitle: Grande\nspec: SPEC-0001-outra\nintent: INTENT-0001-primeiro\nstatus: draft\n---\n## Objetivo\nx\n",
  );
  eventsPath = join(dir, "events.jsonl");
  process.env.GINGA_EVENTS = eventsPath;
  ctx = { by: "eduardo", via: "discord", root, db: openStateDb(join(dir, "state.db")) };
});

const events = () =>
  existsSync(eventsPath)
    ? readFileSync(eventsPath, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as Record<string, any>)
    : [];
const planMd = () => readFileSync(join(root, "plans", "PLAN-0001-auth", "PLAN.md"), "utf8");
const planLog = () => readFileSync(join(root, "plans", "PLAN-0001-auth", "log.md"), "utf8");

describe("triage (critérios determinísticos)", () => {
  test("na dúvida (nenhuma informação) → feature", () => {
    const r = triage({});
    expect(r.track).toBe("feature");
    expect(Array.isArray(r.reasons)).toBe(true);
    expect(r.reasons.length).toBeGreaterThan(0);
  });

  test("poucos arquivos e impacto baixo → small", () => {
    expect(triage({ files: 1 }).track).toBe("small");
    expect(triage({ files: 3 }).track).toBe("small");
    expect(triage({ files: 3, impact: 5 }).track).toBe("small");
  });

  test("arquivos demais ou impacto alto → feature", () => {
    expect(triage({ files: 4 }).track).toBe("feature");
    expect(triage({ files: 1, impact: 6 }).track).toBe("feature");
  });

  test("contrato novo → feature", () => {
    expect(triage({ files: 1, newContract: true }).track).toBe("feature");
  });

  test("flag feature vence; flag small sem evidência vale; small nunca rebaixa evidência", () => {
    expect(triage({ flag: "feature", files: 1 }).track).toBe("feature");
    expect(triage({ flag: "small" }).track).toBe("small");
    expect(triage({ flag: "small", files: 2 }).track).toBe("small");
    expect(triage({ flag: "small", files: 10 }).track).toBe("feature");
    expect(triage({ flag: "small", impact: 9 }).track).toBe("feature");
    expect(triage({ flag: "small", newContract: true }).track).toBe("feature");
  });

  test("é determinística: mesma entrada, mesma saída", () => {
    expect(triage({ files: 2, impact: 1 })).toEqual(triage({ files: 2, impact: 1 }));
  });
});

describe("intent new roda a triagem", () => {
  const intentFile = (id: string) => {
    const f = readdirSync(join(root, "intents")).find((n) => n.startsWith(`${id}-`))!;
    return readFileSync(join(root, "intents", f), "utf8");
  };

  test("files=1 → small, gravado no frontmatter e no resultado", async () => {
    const out: any = await runVerb("intent new", ctx, { text: "Corrigir typo no README", files: "1" });
    expect(out.id).toBe("INTENT-0002");
    expect(out.track).toBe("small");
    expect(Array.isArray(out.reasons)).toBe(true);
    expect(intentFile("INTENT-0002")).toMatch(/\ntrack: small\n/);
  });

  test("sem informação → feature (na dúvida)", async () => {
    const out: any = await runVerb("intent new", ctx, { text: "Quero login com OAuth" });
    expect(out.track).toBe("feature");
    expect(intentFile("INTENT-0002")).toMatch(/\ntrack: feature\n/);
  });

  test("track=feature do usuário vence evidência pequena; track=small não rebaixa files=9", async () => {
    const a: any = await runVerb("intent new", ctx, { text: "Pedido grande", files: "1", track: "feature" });
    expect(a.track).toBe("feature");
    const b: any = await runVerb("intent new", ctx, { text: "Pedido enorme", files: "9", track: "small" });
    expect(b.track).toBe("feature");
    const c: any = await runVerb("intent new", ctx, { text: "Contrato novo", files: "1", contract: "true" });
    expect(c.track).toBe("feature");
  });

  test("files/impact não numéricos → erro citando o argumento", async () => {
    await expect(runVerb("intent new", ctx, { text: "x", files: "muitos" })).rejects.toThrow("files");
    await expect(runVerb("intent new", ctx, { text: "x", impact: "alto" })).rejects.toThrow("impact");
    expect(readdirSync(join(root, "intents")).length).toBe(1);
  });
});

describe("triage promote", () => {
  test("está no registro: write, com plan obrigatório; triage demote não existe", async () => {
    const v = getVerb("triage promote");
    expect(v?.write).toBe(true);
    expect(v?.args.find((a) => a.name === "plan")?.required).toBe(true);
    expect(getVerb("triage demote")).toBeUndefined();
    await expect(runVerb("triage demote", ctx, { plan: "PLAN-0002" })).rejects.toThrow("verbo desconhecido: triage demote");
    await expect(runVerb("triage promote", ctx, {})).rejects.toThrow("falta argumento: plan");
  });

  test("PLAN pequeno vira feature: cria SPEC draft, liga spec: no PLAN, loga e emite transition", async () => {
    const out: any = await runVerb("triage promote", ctx, { plan: "PLAN-0001" });
    expect(out).toMatchObject({ plan: "PLAN-0001", from: "small", track: "feature" });
    expect(out.spec).toMatch(/^SPEC-0002/);
    const file = readdirSync(join(root, "specs")).find((f) => f.startsWith("SPEC-0002-"))!;
    expect(file).toBeDefined();
    const spec = readFileSync(join(root, "specs", file), "utf8");
    expect(spec).toMatch(/^---\ntype: spec\n/);
    expect(spec).toMatch(/\ntitle: Auth plan\n/);
    expect(spec).toMatch(/\nintent: INTENT-0001-primeiro\n/);
    expect(spec).toMatch(/\nstatus: draft\n/);
    expect(spec).toMatch(/\nbench: none\n/);
    expect(planMd()).toMatch(new RegExp(`\\nspec: ${file.replace(/\.md$/, "")}\\n`));
    expect(planMd()).toContain("status: draft");
    expect(planLog()).toContain("triage promote");
    expect(planLog()).toContain("eduardo");
    expect(planLog()).toContain("discord");
    const t = events().find((e) => e.kind === "transition")!;
    expect(t.plan).toBe("PLAN-0001");
    expect(t.data).toMatchObject({ entity: "plan", from: "small", to: "feature", by: "eduardo", via: "discord" });
    expect(validateEvent(t)).toEqual({ ok: true, errors: [] });
  });

  test("não rebaixa nem repete: PLAN que já tem spec: dá erro e nada muda", async () => {
    const before = readFileSync(join(root, "plans", "PLAN-0002-grande", "PLAN.md"), "utf8");
    await expect(runVerb("triage promote", ctx, { plan: "PLAN-0002" })).rejects.toThrow("feature");
    expect(readFileSync(join(root, "plans", "PLAN-0002-grande", "PLAN.md"), "utf8")).toBe(before);
    expect(readdirSync(join(root, "specs")).length).toBe(1);
    await runVerb("triage promote", ctx, { plan: "PLAN-0001" });
    await expect(runVerb("triage promote", ctx, { plan: "PLAN-0001" })).rejects.toThrow("feature");
    expect(readdirSync(join(root, "specs")).length).toBe(2);
  });

  test("PLAN inexistente falha sem criar SPEC", async () => {
    await expect(runVerb("triage promote", ctx, { plan: "PLAN-0099" })).rejects.toThrow();
    expect(readdirSync(join(root, "specs")).length).toBe(1);
  });
});
