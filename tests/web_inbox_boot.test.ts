import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { join } from "node:path";

/**
 * T911: no navegador, `initInbox()` roda sem ninguém injetar o `fetch`. Ele
 * precisa buscar /v1/verbs/inbox sozinho, desenhar os cartões e, se a API
 * falhar, mostrar o erro em vez de fingir que não há nada pendente.
 */
type Node = {
  tag: string;
  className: string;
  textContent: string;
  dataset: Record<string, string>;
  children: Node[];
  type?: string;
  classList: { add: (c: string) => void };
  append: (...n: Node[]) => void;
  setAttribute: (k: string, v: string) => void;
};

function node(tag: string): Node {
  const n: Node = {
    tag,
    className: "",
    textContent: "",
    dataset: {},
    children: [],
    classList: { add: (c) => void (n.className = `${n.className} ${c}`.trim()) },
    append: (...kids) => void n.children.push(...kids),
    setAttribute: (k, v) => void (n.dataset[k] = v),
  };
  return n;
}

const flat = (n: Node): Node[] => [n, ...n.children.flatMap(flat)];
const texts = (n: Node) => flat(n).map((x) => x.textContent).filter(Boolean);

function host() {
  const h = { children: [] as Node[], replaceChildren: (...n: Node[]) => void (h.children = n), addEventListener: () => {}, contains: () => true };
  return h;
}

const saved = { fetch: globalThis.fetch, document: (globalThis as any).document, EventSource: (globalThis as any).EventSource };
let calls: { url: string; method?: string }[];

beforeEach(() => {
  calls = [];
  (globalThis as any).document = { createElement: node, querySelector: () => null, readyState: "complete" };
  (globalThis as any).EventSource = undefined;
});
afterEach(() => {
  globalThis.fetch = saved.fetch;
  (globalThis as any).document = saved.document;
  (globalThis as any).EventSource = saved.EventSource;
});

const load = async (): Promise<any> => import(join(import.meta.dir, "..", "web", "inbox.js"));

describe("initInbox sem fetch injetado", () => {
  test("busca /v1/verbs/inbox com o fetch global e desenha um cartão por pendência", async () => {
    globalThis.fetch = (async (url: string, init?: { method?: string }) => {
      calls.push({ url, method: init?.method });
      return new Response(JSON.stringify({ items: [{ id: "PLAN-0002", type: "aprovar", entity: "PLAN-0002", title: "Segundo arquivo", actions: ["approve", "reject"] }] }));
    }) as any;
    const { initInbox } = await load();
    const h = host();
    await initInbox(h);
    expect(calls).toEqual([{ url: "/v1/verbs/inbox", method: "POST" }]);
    const all = texts(h.children[0]!);
    expect(all).toContain("1 pendência");
    expect(all).toContain("Segundo arquivo");
    expect(all).toContain("Aprovar");
    expect(all).not.toContain("Nada esperando você.");
  });

  test("API fora do ar: o painel mostra o erro, não só a lista vazia", async () => {
    globalThis.fetch = (async () => new Response(JSON.stringify({ error: "bundle ilegível" }), { status: 500 })) as any;
    const { initInbox } = await load();
    const h = host();
    await initInbox(h);
    const status = flat(h.children[0]!).find((n) => "inboxStatus" in n.dataset || "data-inbox-status" in n.dataset);
    expect(status).toBeDefined();
    expect(status!.textContent).toContain("bundle ilegível");
  });
});
