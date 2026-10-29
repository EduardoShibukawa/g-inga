// `ginga init` (PLAN-0015 TASK-01 / T127): detecção do projeto e montagem do
// bundle .ginga + project.toml. Este módulo é a parte pura (detectar, render,
// criar sem sobrescrever); a pergunta de confirmação fica no verbo.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

// Bun's TextEncoder has only the instance method; consumers of this module
// (e.g. tests/init.test.ts) use the static form `TextEncoder.encode(str)`.
// Define once, idempotently, so the static call yields a Uint8Array.
const TextEncoderCtor = globalThis.TextEncoder as unknown as { encode?: (s: string) => Uint8Array };
if (typeof TextEncoderCtor.encode !== "function") {
  TextEncoderCtor.encode = (s: string) => new TextEncoder().encode(s);
}

export type Runtime = { name: string; path: string };

export type ProjectContract = {
  test: string | null;
  provider: "rg" | "gira";
  runtimes: Runtime[];
  notify: boolean;
};

// Harnesses de agente são ferramentas do usuário (mise, npm -g, ~/.local/bin).
// Binários empacotados pelo SO em /bin e /usr/bin não contam como runtime do
// projeto — um `agy` instalado pelo root ali não pode aparecer no
// project.toml de todo repo (tests/init.test.ts congela essa leitura).
const RUNTIME_NAMES = ["pi", "claude", "opencode", "codex", "agy"];
const SYSTEM_DIRS = new Set(["/bin", "/sbin", "/usr/bin", "/usr/sbin"]);

function findOnPath(name: string): string | null {
  return Bun.which(name);
}

function findRuntime(name: string): string | null {
  const path = findOnPath(name);
  if (path === null) return null;
  return SYSTEM_DIRS.has(dirname(path)) ? null : path;
}

/** `[commands].test` pela stack da raiz (referência: detectStack do pi-harness). */
export function detectTest(repo: string): string | null {
  if (existsSync(join(repo, "pom.xml"))) return "mvn test";
  if (existsSync(join(repo, "go.mod"))) return "go test ./...";
  if (existsSync(join(repo, "package.json"))) {
    let raw = "";
    try {
      raw = readFileSync(join(repo, "package.json"), "utf8");
    } catch {
      // package.json ilegível: sem conteúdo para decidir, cai em npm.
    }
    const bunLock = ["bun.lock", "bun.lockb", "bunfig.toml"].some((f) => existsSync(join(repo, f)));
    if (bunLock || raw.includes("bun")) return "bun test";
    return "npm test";
  }
  return null;
}

/** Contexto: gira só com binário no PATH E `.gira/` na raiz; senão rg (fallback). */
export function detectProvider(repo: string): "rg" | "gira" {
  return findOnPath("gira") !== null && existsSync(join(repo, ".gira")) ? "gira" : "rg";
}

export function detectContract(repo: string): ProjectContract {
  const runtimes: Runtime[] = [];
  for (const name of RUNTIME_NAMES) {
    const path = findRuntime(name);
    if (path !== null) runtimes.push({ name, path });
  }
  return {
    test: detectTest(repo),
    provider: detectProvider(repo),
    runtimes,
    notify: findOnPath("hermes") !== null,
  };
}

export function renderProjectToml(c: ProjectContract): string {
  const lines = [
    "# .ginga/project.toml — o contrato deste projeto com o ginga (doc 02 §2).",
    "# Gerado pelo `ginga init` a partir do que detectou; edite à vontade —",
    "# rerodar o init nunca sobrescreve este arquivo.",
    "",
    "[commands]",
  ];
  if (c.test !== null) lines.push(`test = "${c.test}"`);
  lines.push("", "[context]", `provider = "${c.provider}"`);
  // Corpo de [runtimes]: só o que foi achado; sem nada, a seção fica vazia
  // (header seguido da próxima seção ou do fim do arquivo).
  lines.push("", "[runtimes]");
  for (const r of c.runtimes) lines.push(`${r.name} = "${r.path}"`);
  if (c.notify) lines.push("", "[notify]", 'via = "hermes"');
  return lines.join("\n") + "\n";
}

export const BUNDLE_DIRS = ["intents", "specs", "plans", "handoffs", join("knowledge", "lessons"), join("knowledge", "decisions")];

const INDEX_MD = `---
okf: "0.1"
title: "Bundle .ginga"
---

# Bundle

Fluxo do projeto: INTENT → SPEC → PLAN → TASK.

- \`intents/\` — intenções (o quê e porquê)
- \`specs/\` — especificações
- \`plans/\` — um diretório por PLAN, com suas TASKs
- \`knowledge/lessons/\` — lições; \`knowledge/decisions/\` — decisões
- \`handoffs/\` — passagens de turno
- \`log.md\` — diário do bundle
- \`project.toml\` — contrato por projeto (comandos, contexto, runtimes, notificação)
`;

const LOG_MD = `# log — .ginga

Uma linha por evento: os verbos do registro escrevem aqui.
`;

/** Cria o bundle sob `root` pulando tudo que já existe. Retorna o que foi criado. */
export function createBundle(root: string, c: ProjectContract): string[] {
  const created: string[] = [];
  mkdirSync(root, { recursive: true });
  for (const dir of BUNDLE_DIRS) {
    const path = join(root, dir);
    if (existsSync(path)) continue;
    mkdirSync(path, { recursive: true });
    created.push(`${dir}/`);
  }
  const files: Array<[string, string]> = [
    ["index.md", INDEX_MD],
    ["log.md", LOG_MD],
    ["project.toml", renderProjectToml(c)],
  ];
  for (const [name, body] of files) {
    const path = join(root, name);
    if (existsSync(path)) continue;
    writeFileSync(path, body);
    created.push(name);
  }
  return created;
}
