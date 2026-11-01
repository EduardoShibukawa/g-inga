import { describe, expect, test } from "bun:test";
import type { InboxItem } from "../src/board";

/**
 * RED — PLAN-0012 TASK-03 (T325): tela Inbox (render puro, sem browser).
 * Contrato (TASK-03 "Interface"): renderInbox(items: InboxItem[]): string em
 * src/web/render/inbox.ts; cada botão tem data-verb="approve|reject|answer|
 * budget raise|decide" e data-id; o contador de pendências tem data-count.
 * Import dinâmico para o RED falhar por asserção (módulo ausente), não por
 * erro de resolução.
 */

const items: InboxItem[] = [
  { id: "b1", type: "blocker", entity: "PLAN-0001", title: "rotação?", actions: ["answer"] },
  { id: "SPEC-0001", type: "aprovar", entity: "SPEC-0001", title: "Auth", actions: ["approve", "reject"] },
  { id: "PLAN-0002", type: "budget", entity: "PLAN-0002", title: "teto US$ 2", actions: ["budget raise"] },
  { id: "d1", type: "decidir", entity: "modelos", title: "qual modelo?", actions: ["decide"] },
];

describe("renderInbox (TASK-03)", () => {
  test("1 item de cada tipo → botão com data-verb/data-id e contador data-count", async () => {
    const mod = await import("../src/web/render/inbox").catch(() => null);
    expect(mod).not.toBeNull();
    const html = mod!.renderInbox(items);
    expect(html).toContain('data-verb="answer"');
    expect(html).toContain('data-verb="approve"');
    expect(html).toContain('data-verb="reject"');
    expect(html).toContain('data-verb="budget raise"');
    expect(html).toContain('data-verb="decide"');
    expect(html).toContain('data-count="4"');
    expect(html).toContain('data-id="b1"');
    expect(html).toContain('data-id="SPEC-0001"');
    expect(html).toContain('data-id="PLAN-0002"');
    expect(html).toContain('data-id="d1"');
  });

  test("lista vazia → contador zero, sem botão de ação", async () => {
    const mod = await import("../src/web/render/inbox").catch(() => null);
    expect(mod).not.toBeNull();
    const html = mod!.renderInbox([]);
    expect(html).toContain('data-count="0"');
    expect(html).not.toContain("data-verb=");
  });
});
