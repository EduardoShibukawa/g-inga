// Casca da Roda Web: navegação, tema, estado da conexão e transporte.
// As telas e as regras de negócio continuam nos módulos e no registro de verbos.
(() => {
  "use strict";

  const VIEWS = Object.freeze(["inbox", "board", "plan", "alerts", "metrics", "quota"]);
  const THEME_KEY = "ginga:roda-theme";
  const root = document.documentElement;
  let eventSource = null;
  let statusTimer = null;

  function storedTheme() {
    try {
      const value = window.localStorage.getItem(THEME_KEY);
      return value === "light" || value === "dark" ? value : null;
    } catch {
      return null;
    }
  }

  function preferredTheme() {
    try {
      return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    } catch {
      return "light";
    }
  }

  function updateThemeControl(theme) {
    const toggle = document.querySelector("[data-theme-toggle]");
    if (!toggle) return;
    const dark = theme === "dark";
    toggle.setAttribute("aria-pressed", String(dark));
    toggle.setAttribute("aria-label", dark ? "Ativar tema claro" : "Ativar tema escuro");
    const label = toggle.querySelector("[data-theme-label]");
    if (label) label.textContent = dark ? "Claro" : "Escuro";
    const icon = toggle.querySelector(".theme-icon");
    if (icon) icon.textContent = dark ? "☀" : "☾";
  }

  function setTheme(theme, persist = true) {
    const next = theme === "dark" ? "dark" : "light";
    root.setAttribute("data-theme", next);
    updateThemeControl(next);
    if (persist) {
      try {
        window.localStorage.setItem(THEME_KEY, next);
      } catch {
        // O tema continua válido na sessão quando o armazenamento está bloqueado.
      }
    }
  }

  function viewSections() {
    return [...document.querySelectorAll("main [data-view]")].filter((element) =>
      VIEWS.includes(element.getAttribute("data-view")),
    );
  }

  function viewControls() {
    return [...document.querySelectorAll('nav[data-view] [data-view]')].filter((element) =>
      VIEWS.includes(element.getAttribute("data-view")),
    );
  }

  function setView(view, updateHash = true) {
    if (!VIEWS.includes(view)) return;
    for (const section of viewSections()) {
      const active = section.getAttribute("data-view") === view;
      section.hidden = !active;
      section.setAttribute("aria-hidden", String(!active));
    }
    for (const control of viewControls()) {
      const active = control.getAttribute("data-view") === view;
      control.classList.toggle("is-active", active);
      if (active) control.setAttribute("aria-current", "page");
      else control.removeAttribute("aria-current");
    }
    if (updateHash && window.location.hash !== `#${view}`) {
      window.history.replaceState(null, "", `#${view}`);
    }
    window.dispatchEvent(new CustomEvent("ginga:viewchange", { detail: { view } }));
  }

  function setConnection(state, label) {
    const indicator = document.querySelector("[data-connection]");
    if (!indicator) return;
    indicator.setAttribute("data-state", state);
    const text = indicator.querySelector("[data-connection-label]");
    if (text) text.textContent = label;
  }

  function verbSlug(name) {
    return String(name).trim().replace(/\s+/g, "-");
  }

  async function invokeVerb(name, body = {}) {
    const response = await fetch(`/v1/verbs/${encodeURIComponent(verbSlug(name))}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    let payload = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }
    if (!response.ok) {
      const detail = payload?.error ?? `HTTP ${response.status}`;
      throw new Error(`${name}: ${detail}`);
    }
    return payload;
  }

  async function refreshStatus() {
    setConnection("connecting", "Atualizando");
    try {
      await invokeVerb("status");
      setConnection("online", "SSE ativo");
    } catch {
      setConnection("offline", "API indisponível");
    }
  }

  function scheduleStatusRefresh() {
    window.clearTimeout(statusTimer);
    statusTimer = window.setTimeout(() => void refreshStatus(), 250);
  }

  function connectEvents() {
    if (!("EventSource" in window)) {
      setConnection("offline", "SSE indisponível");
      return;
    }
    eventSource = new EventSource("/v1/events");
    eventSource.addEventListener("open", () => setConnection("online", "SSE ativo"));
    eventSource.addEventListener("message", (event) => {
      setConnection("online", "SSE ativo");
      let detail = event.data;
      try {
        detail = JSON.parse(event.data);
      } catch {
        // O stream também pode entregar texto simples.
      }
      window.dispatchEvent(new CustomEvent("ginga:event", { detail }));
      scheduleStatusRefresh();
    });
    eventSource.addEventListener("error", () => setConnection("offline", "Reconectando"));
  }

  function bindControls() {
    document.addEventListener("click", (event) => {
      const control = event.target?.closest?.('nav[data-view] [data-view]');
      if (!control) return;
      const view = control.getAttribute("data-view");
      if (!VIEWS.includes(view)) return;
      event.preventDefault();
      setView(view);
    });

    const themeToggle = document.querySelector("[data-theme-toggle]");
    themeToggle?.addEventListener("click", () => {
      setTheme(root.getAttribute("data-theme") === "dark" ? "light" : "dark");
    });

    document.querySelector("[data-refresh-status]")?.addEventListener("click", () => {
      void refreshStatus();
    });

    window.addEventListener("hashchange", () => {
      const view = window.location.hash.slice(1);
      if (VIEWS.includes(view)) setView(view, false);
    });
  }

  function start() {
    setTheme(storedTheme() ?? preferredTheme(), false);
    bindControls();
    const initial = window.location.hash.slice(1);
    setView(VIEWS.includes(initial) ? initial : "inbox", false);
    void refreshStatus();
    connectEvents();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }

  window.addEventListener("beforeunload", () => eventSource?.close());
})();
