// Render puro da tela Quadro (PLAN-0012 TASK-04).

import type { Board, Card, Column } from "../../board";

export type BoardFilters = { repo?: string; track?: string };

const COLUMN_ORDER: readonly Column[] = ["INTENT", "SPEC", "PLAN", "EXECUTANDO", "VERIFICANDO", "FEITO"];
const APPROVAL_STATUSES = new Set(["draft", "approval", "aprovar", "pending_approval", "awaiting_approval"]);
const RUNNING_STATUSES = new Set(["executando", "executing", "running", "in_progress"]);
const BLOCKED_STATUSES = new Set(["blocked", "blocker"]);

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    const entities: Record<string, string> = {
      "&": "&" + "amp;",
      "<": "&" + "lt;",
      ">": "&" + "gt;",
      '"': "&" + "quot;",
      "'": "&" + "#39;",
    };
    return entities[char]!;
  });
}

function filterValue(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function matches(card: Card, filters: BoardFilters): boolean {
  const repo = filterValue(filters.repo);
  const track = filterValue(filters.track);
  if (repo !== undefined && card.repo !== repo) return false;
  if (track !== undefined && card.track !== track) return false;
  return true;
}

function flagsFor(card: Card): string[] {
  const status = card.status.toLowerCase();
  const flags: string[] = [];
  if (card.blocked || BLOCKED_STATUSES.has(status)) flags.push("⚑");
  if (card.kind !== "intent" && APPROVAL_STATUSES.has(status)) flags.push("✓?");
  if (card.tasks.running > 0 || RUNNING_STATUSES.has(status)) flags.push("⟳");
  return flags;
}

function renderCard(card: Card): string {
  const flags = flagsFor(card);
  const total = card.tasks.total;
  const progress = total > 0
    ? `<span class="board-card-progress" data-progress="${card.tasks.pass}/${total}">${card.tasks.pass}/${total} TASKs</span>`
    : "";
  const details = [card.repo, card.track, card.status].filter((value): value is string => Boolean(value));
  return `<article class="board-card" data-card-id="${escapeHtml(card.id)}" data-kind="${escapeHtml(card.kind)}" data-status="${escapeHtml(card.status)}" data-repo="${escapeHtml(card.repo ?? "")}" data-track="${escapeHtml(card.track ?? "")}">
  <header class="board-card-header"><span class="board-card-id">${escapeHtml(card.id)}</span><span class="board-card-flags" aria-label="${escapeHtml(flags.join(" "))}">${flags.join(" ")}</span></header>
  <h3 class="board-card-title">${escapeHtml(card.title)}</h3>
  <p class="board-card-details">${details.map(escapeHtml).join(" · ")}</p>
  ${progress}
</article>`;
}

/** HTML do Quadro. Não consulta estado nem executa verbos. */
export function renderBoard(b: Board, f: BoardFilters = {}): string {
  const repo = filterValue(f.repo) ?? "";
  const track = filterValue(f.track) ?? "";
  const columns = COLUMN_ORDER.map((column) => {
    const cards = (b.columns[column] ?? []).filter((card) => matches(card, f));
    const rendered = cards.map(renderCard).join("\n");
    return `<section class="board-column" data-column="${column}" aria-labelledby="board-column-${column}">
  <header class="board-column-header"><h2 id="board-column-${column}">${column}</h2><span class="board-column-count" data-count="${cards.length}">${cards.length}</span></header>
  <div class="board-cards">${rendered}</div>
</section>`;
  }).join("\n");

  return `<section class="roda-board" data-board data-repo-filter="${escapeHtml(repo)}" data-track-filter="${escapeHtml(track)}">
  <header class="board-header"><h1>Quadro</h1></header>
  <div class="board-columns">${columns}</div>
  <p class="board-legend"><span>⚑ blocker</span> · <span>✓? aguardando aprovação</span> · <span>⟳ rodando</span></p>
</section>`;
}
