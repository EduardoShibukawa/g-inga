import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");

/**
 * RED — PLAN-0012 follow-up do judge 2026-11-01 (TASK-03 reprovada, T330):
 * web/inbox.js não existe; os botões do Inbox não estão ligados a /v1/verbs e
 * o contador não usa SSE. Contrato: botão data-verb/data-id dispara
 * POST /v1/verbs/<slug> (espaço → "-") com { id } no corpo JSON; o contador
 * [data-count] é atualizado por SSE em /v1/events (re-lê POST /v1/verbs/inbox).
 */

function button(verb: string, id: string) {
  return {
    getAttribute: (name: string) => (name === "data-verb" ? verb : name === "data-id" ? id : null),
    closest: () => null,
  } as any;
}

function counter() {
  return {
    attrs: {} as Record<string, string>,
    textContent: "",
    setAttribute(name: string, value: string) {
      this.attrs[name] = value;
    },
  } as any;
}

describe("web/inbox.js — T330", () => {
  test("arquivo real existe, não é vazio e assina /v1/events", () => {
    const js = readFileSync(join(ROOT, "web", "inbox.js"), "utf8");
    expect(js.length).toBeGreaterThan(100);
    expect(js).toContain("/v1/events");
  });

  test("inboxVerbRequest: data-verb/data-id → path /v1/verbs/<slug> e body { id }", async () => {
    const mod = await import("../web/inbox.js").catch(() => null);
    expect(mod).not.toBeNull();
    const req = mod!.inboxVerbRequest(button("answer", "b1"));
    expect(req.verb).toBe("answer");
    expect(req.path).toBe("/v1/verbs/answer");
    expect(req.body).toEqual({ id: "b1" });
    const raise = mod!.inboxVerbRequest(button("budget raise", "PLAN-0002"));
    expect(raise.path).toBe("/v1/verbs/budget-raise");
    expect(raise.body).toEqual({ id: "PLAN-0002" });
  });

  test("invokeInboxVerb: POST JSON em /v1/verbs/<slug> e devolve o JSON da resposta", async () => {
    const mod = await import("../web/inbox.js");
    const calls: Array<{ path: string; init: any }> = [];
    const fetcher = (async (path: string, init: any) => {
      calls.push({ path, init });
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } });
    }) as any;
    const out = await mod!.invokeInboxVerb(button("approve", "SPEC-0001"), fetcher);
    expect(calls.length).toBe(1);
    expect(calls[0]!.path).toBe("/v1/verbs/approve");
    expect(calls[0]!.init.method).toBe("POST");
    expect(calls[0]!.init.headers["content-type"]).toBe("application/json");
    expect(JSON.parse(calls[0]!.init.body)).toEqual({ id: "SPEC-0001" });
    expect(out).toEqual({ ok: true });
  });

  test("refreshInboxCount: POST /v1/verbs/inbox e grava [data-count] no contador", async () => {
    const mod = await import("../web/inbox.js");
    const el = counter();
    const fetcher = (async () =>
      new Response(JSON.stringify({ items: [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }] }), { status: 200 })) as any;
    const n = await mod!.refreshInboxCount(el, fetcher);
    expect(n).toBe(4);
    expect(el.attrs["data-count"]).toBe("4");
    expect(el.textContent).toBe("4");
  });

  test("connectInboxSse: evento \"message\" do SSE dispara a atualização do contador", async () => {
    const mod = await import("../web/inbox.js");
    const el = counter();
    let onMessage: ((ev: any) => void) | null = null;
    const source = {
      addEventListener: (type: string, fn: any) => {
        if (type === "message") onMessage = fn;
      },
    } as any;
    let inboxCalls = 0;
    const fetcher = (async (path: string) => {
      if (path === "/v1/verbs/inbox") {
        inboxCalls++;
        return new Response(JSON.stringify({ items: [{ id: "x" }] }), { status: 200 });
      }
      return new Response("{}", { status: 200 });
    }) as any;
    mod!.connectInboxSse(el, source, fetcher);
    expect(onMessage).not.toBeNull();
    await onMessage!({ data: JSON.stringify({ id: "e1", kind: "transition" }) });
    expect(inboxCalls).toBe(1);
    expect(el.attrs["data-count"]).toBe("1");
  });
});
