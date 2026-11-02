// Render puro do detalhe do PLAN (PLAN-0012 TASK-05).
// A tela só apresenta o modelo recebido; as regras dos verbos ficam no
// registro de src/verbs/registry.ts.

export type PlanReceipt = string | {
  status?: string;
  state?: string;
  hash?: string;
  ledger_n?: number;
  check?: string;
};

export type PlanAttempt = {
  model: string;
  cost_usd: number;
  pass?: boolean;
  passed?: boolean;
  runtime?: string;
  provider?: string;
  tokens?: number;
  tokens_total?: number;
  tokens_in?: number;
  tokens_out?: number;
  attempt_n?: number;
  failure?: string;
};

export type PlanTask = {
  id: string;
  status: string;
  attempts: PlanAttempt[];
  title?: string;
  receipt?: PlanReceipt | null;
  receipt_status?: string;
  depends_on?: string | string[];
  blocked_by?: string | string[];
};

export type PlanDetail = {
  id: string;
  status: string;
  spent_usd: number;
  cap_usd: number;
  tasks: PlanTask[];
  log: string;
  title?: string;
  spec?: string | string[];
  spec_id?: string;
  repo?: string | string[];
  repos?: string | string[];
};

export type Plan = PlanDetail;

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

function list(value: string | string[] | undefined): string[] {
  const values = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [];
  return values.map((item) => item.trim()).filter((item) => item !== "");
}

function finite(value: number | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function formatUsd(value: number | undefined): string {
  return `US$ ${(finite(value) ?? 0).toFixed(2)}`;
}

function compactNumber(value: number): string {
  return value.toFixed(value < 10 ? 1 : 0).replace(/\.0$/, "");
}

function formatTokens(value: number | undefined): string {
  if (value === undefined) return "—";
  if (value >= 1_000_000) return `${compactNumber(value / 1_000_000)}M`;
  if (value >= 1_000) return `${compactNumber(value / 1_000)}k`;
  return String(value);
}

function totalTokens(attempt: PlanAttempt): number | undefined {
  const explicit = finite(attempt.tokens_total ?? attempt.tokens);
  if (explicit !== undefined) return explicit;
  const input = finite(attempt.tokens_in);
  const output = finite(attempt.tokens_out);
  if (input === undefined && output === undefined) return undefined;
  return (input ?? 0) + (output ?? 0);
}

function receiptDetails(task: PlanTask): { status: string; label: string } {
  const receipt = task.receipt;
  if (typeof receipt === "string" && receipt.trim() !== "") {
    return { status: receipt.trim(), label: receipt.trim() };
  }
  if (receipt && typeof receipt === "object") {
    const status = receipt.status ?? receipt.state ?? (receipt.ledger_n !== undefined ? `ledger #${receipt.ledger_n}` : "—");
    const details = [status];
    if (receipt.check) details.push(receipt.check);
    if (receipt.ledger_n !== undefined && status !== `ledger #${receipt.ledger_n}`) details.push(`#${receipt.ledger_n}`);
    if (receipt.hash) details.push(receipt.hash);
    return { status, label: details.join(" · ") };
  }
  if (task.receipt_status) return { status: task.receipt_status, label: task.receipt_status };
  const status = task.status.toLowerCase();
  if (["pass", "done", "complete", "completed"].includes(status)) return { status: "pass", label: "pass" };
  if (["fail", "failed", "error"].includes(status)) return { status: "fail", label: "fail" };
  return { status: "", label: "—" };
}

function blockedBy(task: PlanTask): string[] {
  const explicit = list(task.blocked_by);
  if (explicit.length > 0) return explicit;
  const status = task.status.toLowerCase();
  return ["blocked", "blocker"].includes(status) ? list(task.depends_on) : [];
}

function renderAttempt(attempt: PlanAttempt, index: number): string {
  const number = finite(attempt.attempt_n) ?? index + 1;
  const runtime = attempt.runtime ?? attempt.provider ?? "—";
  const tokens = totalTokens(attempt);
  const passed = attempt.pass ?? attempt.passed;
  const verdict = passed === true ? "✓ pass" : passed === false ? "✗ fail" : "—";
  const failure = attempt.failure ? ` · ${attempt.failure}` : "";
  return `<li class="plan-attempt" data-attempt="${number}" data-pass="${passed === undefined ? "" : String(passed)}">
  <span class="plan-attempt-verdict">${verdict}</span>
  <span class="plan-attempt-runtime" data-runtime="${escapeHtml(runtime)}">runtime: ${escapeHtml(runtime)}</span>
  <span class="plan-attempt-model" data-model="${escapeHtml(attempt.model)}">modelo: ${escapeHtml(attempt.model)}</span>
  <span class="plan-attempt-tokens" data-tokens="${tokens ?? ""}">${formatTokens(tokens)} tok</span>
  <span class="plan-attempt-cost" data-cost-usd="${finite(attempt.cost_usd) ?? ""}">${formatUsd(attempt.cost_usd)}</span>
  ${failure ? `<span class="plan-attempt-failure">${escapeHtml(failure)}</span>` : ""}
</li>`;
}

function renderTask(task: PlanTask, planId: string): string {
  const dependsOn = list(task.depends_on);
  const blockers = blockedBy(task);
  const receipt = receiptDetails(task);
  const attempts = task.attempts ?? [];
  const attemptCost = attempts.reduce((sum, attempt) => sum + (finite(attempt.cost_usd) ?? 0), 0);
  const dependencyText = dependsOn.length > 0 ? dependsOn.join(", ") : "—";
  const blockerText = blockers.length > 0 ? blockers.join(", ") : "—";
  const title = task.title ? `<span class="plan-task-title">${escapeHtml(task.title)}</span>` : "";
  const attemptList = attempts.length > 0
    ? attempts.map(renderAttempt).join("\n")
    : `<li class="plan-attempt plan-attempt-empty">sem tentativas</li>`;

  return `<li class="plan-task-item">
  <article class="plan-task" data-task-id="${escapeHtml(task.id)}" data-status="${escapeHtml(task.status)}" data-depends-on="${escapeHtml(dependsOn.join(" "))}" data-blocked-by="${escapeHtml(blockers.join(" "))}">
    <header class="plan-task-header">
      <h3>${escapeHtml(task.id)}</h3>
      ${title}
      <span class="plan-task-status">${escapeHtml(task.status)}</span>
      <span class="plan-task-receipt" data-receipt="${escapeHtml(receipt.status)}">receipt: ${escapeHtml(receipt.label)}</span>
    </header>
    <dl class="plan-task-summary">
      <div><dt>Depende de</dt><dd>${escapeHtml(dependencyText)}</dd></div>
      <div><dt>Bloqueada por</dt><dd>${escapeHtml(blockerText)}</dd></div>
      <div><dt>Custo</dt><dd data-task-cost-usd="${attemptCost}">${formatUsd(attemptCost)}</dd></div>
    </dl>
    <ol class="plan-attempts" data-attempts>${attemptList}</ol>
    <div class="plan-task-actions">
      <button type="button" class="plan-action" data-verb="retry" data-plan="${escapeHtml(planId)}" data-task="${escapeHtml(task.id)}">Retry</button>
      <button type="button" class="plan-action" data-verb="escalate" data-plan="${escapeHtml(planId)}" data-task="${escapeHtml(task.id)}">Escalar ▲</button>
    </div>
  </article>
</li>`;
}

/** HTML do detalhe do PLAN. Não consulta estado nem executa verbos. */
export function renderPlan(p: PlanDetail): string {
  const specs = list(p.spec ?? p.spec_id);
  const repos = list(p.repo ?? p.repos);
  const tasks = (p.tasks ?? []).map((task) => renderTask(task, p.id)).join("\n");
  const specText = specs.length > 0 ? specs.join(" · ") : "—";
  const repoText = repos.length > 0 ? repos.join(" · ") : "—";
  const title = p.title ? ` · ${escapeHtml(p.title)}` : "";

  return `<section class="roda-plan" data-plan="${escapeHtml(p.id)}" data-status="${escapeHtml(p.status)}" data-spent-usd="${finite(p.spent_usd) ?? 0}" data-cap-usd="${finite(p.cap_usd) ?? 0}">
  <header class="plan-header">
    <div class="plan-heading">
      <p class="plan-meta">SPEC: ${escapeHtml(specText)} · repo: ${escapeHtml(repoText)}</p>
      <h1>${escapeHtml(p.id)}${title}</h1>
      <p class="plan-status-line"><span class="plan-status">${escapeHtml(p.status)}</span> · <span class="plan-cost" data-spent="${finite(p.spent_usd) ?? 0}" data-cap="${finite(p.cap_usd) ?? 0}">${formatUsd(p.spent_usd)} / ${formatUsd(p.cap_usd)}</span></p>
    </div>
    <div class="plan-header-actions">
      <button type="button" class="plan-action" data-verb="pause" data-plan="${escapeHtml(p.id)}">Pausar</button>
      <button type="button" class="plan-action" data-verb="cancel" data-plan="${escapeHtml(p.id)}">Cancelar</button>
    </div>
  </header>
  <section class="plan-tasks" aria-labelledby="plan-tasks-title">
    <h2 id="plan-tasks-title">TASKs (DAG)</h2>
    <ol class="plan-task-list" data-dag>${tasks}</ol>
  </section>
  <section class="plan-log" data-log aria-labelledby="plan-log-title">
    <h2 id="plan-log-title">log.md</h2>
    <pre class="plan-log-content">${escapeHtml(p.log ?? "")}</pre>
  </section>
</section>`;
}
