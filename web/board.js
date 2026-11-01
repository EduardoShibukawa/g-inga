// Quadro da Roda Web (PLAN-0012 TASK-04).
// A API devolve o modelo; este módulo cuida apenas da apresentação e dos
// filtros refletidos na URL (?repo=...&track=...).

export const BOARD_COLUMNS = Object.freeze([
  "INTENT",
  "SPEC",
  "PLAN",
  "EXECUTANDO",
  "VERIFICANDO",
  "FEITO",
]);

export const BOARD_TRACKS = Object.freeze(["pequena", "feature"]);

const APPROVAL_STATUSES = new Set(["draft", "approval", "aprovar", "pending_approval", "awaiting_approval"]);
const RUNNING_STATUSES = new Set(["executando", "executing", "running", "in_progress"]);
const BLOCKED_STATUSES = new Set(["blocked", "blocker"]);

function normalized(value) {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed || undefined;
}

function currentHref() {
  return typeof window !== "undefined" && window.location ? window.location.href : "http://localhost/";
}

function asUrl(source) {
  const value = source instanceof URL ? source.href : source ?? currentHref();
  return new URL(value, "http://localhost/");
}

/** Lê repo e track da URL; uma trilha desconhecida é ignorada. */
export function boardFiltersFromUrl(source) {
  const url = asUrl(source);
  const repo = normalized(url.searchParams.get("repo"));
  const rawTrack = normalized(url.searchParams.get("track"));
  const track = BOARD_TRACKS.includes(rawTrack) ? rawTrack : undefined;
  return {
    ...(repo ? { repo } : {}),
    ...(track ? { track } : {}),
  };
}

/** Devolve a URL com os filtros atuais, sem os parâmetros vazios. */
export function boardFiltersToUrl(filters = {}, source) {
  const url = asUrl(source);
  const repo = normalized(filters.repo);
  const track = normalized(filters.track);
  if (repo) url.searchParams.set("repo", repo);
  else url.searchParams.delete("repo");
  if (track && BOARD_TRACKS.includes(track)) url.searchParams.set("track", track);
  else url.searchParams.delete("track");
  return url.toString();
}

export const filtersFromUrl = boardFiltersFromUrl;
export const filtersToUrl = boardFiltersToUrl;

/** Aplica os filtros sem mutar o Board recebido. */
export function filterBoard(board, filters = {}) {
  const repo = normalized(filters.repo);
  const track = normalized(filters.track);
  const columns = { ...(board.columns ?? {}) };
  for (const column of BOARD_COLUMNS) {
    columns[column] = (board.columns?.[column] ?? []).filter((card) => {
      if (repo && card.repo !== repo) return false;
      if (track && card.track !== track) return false;
      return true;
    });
  }
  return { ...board, columns };
}

function flagsFor(card) {
  const status = String(card.status ?? "").toLowerCase();
  const flags = [];
  if (card.blocked || BLOCKED_STATUSES.has(status)) flags.push("⚑");
  if (card.kind !== "intent" && APPROVAL_STATUSES.has(status)) flags.push("✓?");
  if (Number(card.tasks?.running ?? 0) > 0 || RUNNING_STATUSES.has(status)) flags.push("⟳");
  return flags;
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function repoOptions(board) {
  const repos = new Set();
  for (const column of BOARD_COLUMNS) {
    for (const card of board.columns?.[column] ?? []) {
      if (card.repo) repos.add(card.repo);
    }
  }
  return [...repos].sort((a, b) => a.localeCompare(b));
}

function renderFilters(board, filters) {
  const wrapper = element("div", "board-filters");
  const repoLabel = element("label", "board-filter");
  repoLabel.append(element("span", "board-filter-label", "Repo"));
  const repo = element("select", "board-filter-repo");
  repo.dataset.filter = "repo";
  for (const value of ["", ...repoOptions(board)]) {
    const option = element("option", "", value || "todos");
    option.value = value;
    repo.append(option);
  }
  repo.value = filters.repo ?? "";
  repoLabel.append(repo);

  const trackLabel = element("label", "board-filter");
  trackLabel.append(element("span", "board-filter-label", "Trilha"));
  const track = element("select", "board-filter-track");
  track.dataset.filter = "track";
  for (const value of ["", ...BOARD_TRACKS]) {
    const option = element("option", "", value || "todas");
    option.value = value;
    track.append(option);
  }
  track.value = filters.track ?? "";
  trackLabel.append(track);

  wrapper.append(repoLabel, trackLabel);
  return wrapper;
}

function renderCard(card) {
  const article = element("article", "board-card");
  article.dataset.cardId = card.id;
  article.dataset.kind = card.kind;
  article.dataset.status = card.status;
  article.dataset.repo = card.repo ?? "";
  article.dataset.track = card.track ?? "";

  const header = element("header", "board-card-header");
  header.append(element("span", "board-card-id", card.id));
  header.append(element("span", "board-card-flags", flagsFor(card).join(" ")));
  article.append(header);
  article.append(element("h3", "board-card-title", card.title));

  const details = [card.repo, card.track, card.status].filter(Boolean);
  article.append(element("p", "board-card-details", details.join(" · ")));

  const total = Number(card.tasks?.total ?? 0);
  if (total > 0) {
    const pass = Number(card.tasks?.pass ?? 0);
    const progress = element("span", "board-card-progress", `${pass}/${total} TASKs`);
    progress.dataset.progress = `${pass}/${total}`;
    article.append(progress);
  }
  return article;
}

/** Cria a árvore DOM do Quadro; a fonte continua sendo o modelo da API. */
export function renderBoardElement(board, filters = {}) {
  const root = element("section", "roda-board");
  root.dataset.board = "";
  root.dataset.repoFilter = filters.repo ?? "";
  root.dataset.trackFilter = filters.track ?? "";
  const header = element("header", "board-header");
  header.append(element("h1", "", "Quadro"));
  root.append(header, renderFilters(board, filters));

  const columns = element("div", "board-columns");
  const visible = filterBoard(board, filters);
  for (const name of BOARD_COLUMNS) {
    const column = element("section", "board-column");
    column.dataset.column = name;
    const header = element("header", "board-column-header");
    const heading = element("h2", "", name);
    heading.id = `board-column-${name}`;
    column.setAttribute("aria-labelledby", heading.id);
    const count = element("span", "board-column-count", String(visible.columns[name].length));
    count.dataset.count = String(visible.columns[name].length);
    header.append(heading, count);
    column.append(header);

    const cards = element("div", "board-cards");
    for (const card of visible.columns[name]) cards.append(renderCard(card));
    column.append(cards);
    columns.append(column);
  }
  root.append(columns);
  root.append(element("p", "board-legend", "⚑ blocker · ✓? aguardando aprovação · ⟳ rodando"));
  return root;
}

function filtersFromControls(root) {
  const repo = root.querySelector('[data-filter="repo"]')?.value;
  const track = root.querySelector('[data-filter="track"]')?.value;
  return {
    ...(repo ? { repo } : {}),
    ...(track ? { track } : {}),
  };
}

/** Monta o quadro e conecta os selects à URL. */
export function mountBoard(host, board, filters = boardFiltersFromUrl()) {
  const root = renderBoardElement(board, filters);
  host.replaceChildren(root);
  for (const select of root.querySelectorAll("[data-filter]")) {
    select.addEventListener("change", () => {
      const next = filtersFromControls(root);
      const url = boardFiltersToUrl(next);
      if (typeof window !== "undefined" && window.history) {
        window.history.replaceState(null, "", url);
      }
      mountBoard(host, board, next);
    });
  }
  return root;
}

export async function fetchBoard() {
  const response = await fetch("/v1/verbs/board", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
  if (!response.ok) throw new Error(`board: HTTP ${response.status}`);
  return response.json();
}

/** Inicializa a tela quando o elemento [data-board] está presente. */
export async function initBoard(host = document.querySelector("[data-board]")) {
  if (!host) return;
  const board = await fetchBoard();
  mountBoard(host, board, boardFiltersFromUrl());
}

if (typeof document !== "undefined") {
  const start = () => void initBoard();
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
}
