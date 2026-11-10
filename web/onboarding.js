// Tela Onboarding da Roda Web (T917). Mostra o que o verbo `detect` leu do
// projeto e o project.toml proposto; o botão cria o bundle pelo verbo `init`
// (com `yes`), que nunca sobrescreve o que já existe.

const DETECT_PATH = "/v1/verbs/detect";
const INIT_PATH = "/v1/verbs/init";

function escapeHtml(value) {
  const text = value === null || value === undefined ? "" : String(value);
  const entities = { "&": "&" + "amp;", "<": "&" + "lt;", ">": "&" + "gt;", '"': "&" + "quot;", "'": "&" + "#39;" };
  return text.replace(/[&<>"']/g, (char) => entities[char]);
}

function step(n, title, hint, body) {
  return `<section class="onboarding-step">
    <h2><span class="onboarding-n" aria-hidden="true">${n}</span> ${escapeHtml(title)}</h2>
    <p class="onboarding-hint">${hint}</p>
    ${body}
  </section>`;
}

function doneBlock(result) {
  const created = Array.isArray(result?.created) ? result.created : [];
  return `<section class="onboarding-done" role="status">
    <h2>Pronto</h2>
    ${created.length === 0
      ? `<p>Nada faltava: o <code>.ginga/</code> já estava completo e nada foi alterado.</p>`
      : `<p>Criado em <code>.ginga/</code>:</p><ul class="onboarding-created">${created.map((c) => `<li><code>${escapeHtml(c)}</code></li>`).join("")}</ul>`}
    <p>Próximo passo: mande o primeiro pedido, por aqui (<strong>+ Intent</strong>) ou pela CLI (<code>ginga intent new "…"</code>).</p>
  </section>`;
}

/** HTML puro da tela. `result` = resposta do `init`, quando já criou. */
export function renderOnboardingHtml(data, result = null, note = "") {
  if (!data || data.error) {
    return `<section class="roda-onboarding"><p class="empty-state" role="alert">Não deu para ler o projeto: ${escapeHtml(data?.error ?? "sem resposta")}</p></section>`;
  }
  const d = data.detected ?? {};
  const runtimes = Array.isArray(d.runtimes) ? d.runtimes : [];
  const hasToml = Boolean(data.bundle?.project_toml);

  const steps = [
    step(1, "Projeto detectado", "Lido do repositório.",
      d.test
        ? `<dl class="onboarding-facts"><dt>Comando de teste</dt><dd><code>${escapeHtml(d.test)}</code></dd></dl>`
        : `<p class="onboarding-missing">Nenhum comando de teste detectado. Defina <code>[commands].test</code> no project.toml.</p>`),
    step(2, "Contexto do código", "Opcional. Sem provider, o fallback é rg + git.",
      `<dl class="onboarding-facts"><dt>Provider</dt><dd>${d.provider === "gira" ? "<code>gira</code> (binário no PATH e <code>.gira/</code> na raiz)" : "rg + git (fallback)"}</dd></dl>`),
    step(3, "Runtimes encontrados", "Lidos do PATH. Os papéis seguem o roteamento de modelos; dá para trocar depois.",
      runtimes.length === 0
        ? `<p class="onboarding-missing">Nenhum runtime encontrado no PATH (pi, claude, opencode, codex, agy).</p>`
        : `<ul class="onboarding-runtimes">${runtimes.map((r) => `<li data-runtime="${escapeHtml(r?.name)}"><strong>${escapeHtml(r?.name)}</strong> <code>${escapeHtml(r?.path)}</code></li>`).join("")}</ul>`),
    step(4, "Notificações", "Onde o ginga avisa quando precisa de você.",
      d.notify
        ? `<p>Hermes encontrado: os avisos saem por ele. Os canais ficam em <code>[notify.targets]</code>.</p>`
        : `<p class="onboarding-missing">Hermes não encontrado: sem avisos fora da Roda até configurar <code>[notify]</code>.</p>`),
    step(5, "Revisar e criar",
      hasToml
        ? "Este workspace já tem <code>.ginga/project.toml</code>. Nada é sobrescrito; abaixo está o que o ginga proporia hoje."
        : "Será criado <code>.ginga/</code> com index.md, log.md e project.toml. Nada mais no repositório é alterado.",
      `<pre class="onboarding-toml"><code>${escapeHtml(data.toml)}</code></pre>
    ${result ? "" : `<button type="button" class="onboarding-create" data-onboarding-create>${hasToml ? "Completar o que falta" : "Criar .ginga"}</button>`}`),
  ].join("\n  ");

  return `<section class="roda-onboarding">
  ${note ? `<p class="onboarding-error" role="alert">${escapeHtml(note)}</p>` : ""}
  ${steps}
  ${result ? doneBlock(result) : ""}
</section>`;
}

async function post(path, body, fetcher) {
  const response = await fetcher(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (!response?.ok) throw new Error(payload && typeof payload.error === "string" ? payload.error : `HTTP ${response?.status ?? "?"}`);
  return payload;
}

/** Lê o projeto e monta a tela. */
export async function loadOnboarding(host, fetcher = globalThis.fetch, result = null, note = "") {
  if (!host) return null;
  let data;
  try {
    data = await post(DETECT_PATH, {}, fetcher);
  } catch (error) {
    data = { error: error instanceof Error ? error.message : String(error) };
  }
  host.innerHTML = renderOnboardingHtml(data, result, note);
  return data;
}

/** Cria o bundle pelo verbo `init` (nunca sobrescreve). */
export function createBundle(fetcher = globalThis.fetch) {
  return post(INIT_PATH, { yes: "true" }, fetcher);
}

if (typeof document !== "undefined") {
  const start = () => {
    const host = document.querySelector("[data-onboarding]");
    if (!host) return;
    host.addEventListener("click", async (event) => {
      const button = event.target?.closest?.("[data-onboarding-create]");
      if (!button) return;
      button.disabled = true;
      try {
        const result = await createBundle();
        await loadOnboarding(host, globalThis.fetch, result);
      } catch (error) {
        await loadOnboarding(host, globalThis.fetch, null, error instanceof Error ? error.message : String(error));
      }
    });
    window.addEventListener("ginga:viewchange", (event) => {
      if (event.detail?.view === "onboarding") void loadOnboarding(host);
    });
    if (window.location.hash === "#onboarding") void loadOnboarding(host);
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
}
