import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { join } from "node:path";

/**
 * T912: depois de um verbo do Inbox dar certo, a tela relê /v1/verbs/inbox e
 * o cartão resolvido some. Antes ele ficava até recarregar a página.
 */
type Node = {
  tag: string;
  className: string;
  textContent: string;
  dataset: Record<string, string>;
  children: Node[];
  disabled?: boolean;
  classList: { add: (c: string) => void };
  append: (...n: Node[]) => void;
  setAttribute: (k: string, v: string) => void;
  getAttribute: (k: string) => string | null;
  closest: (sel: string) => Node | null;
  dispatchEvent: () => boolean;
};

function node(tag: string): Node {
  const attrs: Record<string, string> = {};
  const n: Node = {
    tag,
    className: "",
    textContent: "",
    dataset: {},
    children: [],
    classList: { add: (c) => void (n.className = `${n.className} ${c}`.trim()) },
    append: (...kids) => void n.children.push(...kids),
    setAttribute: (k, v) => void (attrs[k] = v),
    getAttribute: (k) => attrs[k] ?? (k.startsWith("data-") ? (n.dataset[k.slice(5)] ?? null) : null),
    closest: (sel) => (sel === "button[data-verb]" && n.tag === "button" && n.dataset.verb ? n : null),
    dispatchEvent: () => true,
  };
  return n;
}
const flat = (n: Node): Node[] => [n, ...n.children.flatMap(flat)];

function host() {
  let onClick: ((e: { target: Node; preventDefault: () => void }) => Promise<void>) | null = null;
  const h = {
    children: [] as Node[],
    replaceChildren: (...n: Node[]) => void (h.children = n),
    addEventListener: (_: string, fn: typeof onClick) => void (onClick = fn),
    contains: () => true,
    click: (target: Node) => onClick!({ target, preventDefault: () => {} }),
  };
  return h;
}

const saved = { fetch: globalThis.fetch, document: (globalThis as any).document, EventSource: (globalThis as any).EventSource };
beforeEach(() => {
  (globalThis as any).document = { createElement: node, querySelector: () => null, readyState: "complete" };
  (globalThis as any).EventSource = undefined;
});
afterEach(() => {
  globalThis.fetch = saved.fetch;
  (globalThis as any).document = saved.document;
  (globalThis as any).EventSource = saved.EventSource;
});

describe("Inbox depois de uma ação", () => {
  test("aprovar: a lista é relida e o cartão resolvido some", async () => {
    let pending = [{ id: "PLAN-0002", type: "aprovar", entity: "PLAN-0002", title: "Segundo arquivo", actions: ["approve", "reject"] }];
    const urls: string[] = [];
    globalThis.fetch = (async (url: string) => {
      urls.push(url);
      if (url === "/v1/verbs/approve") {
        pending = [];
        return new Response(JSON.stringify({ id: "PLAN-0002", status: "approved" }));
      }
      return new Response(JSON.stringify({ items: pending }));
    }) as any;
    const { initInbox } = await import(join(import.meta.dir, "..", "web", "inbox.js"));
    const h = host();
    await initInbox(h);
    const button = flat(h.children[0]!).find((n) => n.tag === "button" && n.dataset.verb === "approve")!;
    expect(button).toBeDefined();

    await h.click(button);

    expect(urls).toEqual(["/v1/verbs/inbox", "/v1/verbs/approve", "/v1/verbs/inbox"]);
    const all = flat(h.children[0]!).map((n) => n.textContent);
    expect(all).toContain("0 pendências");
    expect(all).not.toContain("Segundo arquivo");
    expect(all.some((t) => t.includes("approve: ok"))).toBe(true);
  });
});
