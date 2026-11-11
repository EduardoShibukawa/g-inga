import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * T919: no celular (até 640px) a navegação fixa embaixo é uma linha rolável.
 * O corpo reserva 72px; uma grade de três colunas com nove itens passava disso.
 */
const css = readFileSync(join(import.meta.dir, "..", "web", "style.css"), "utf8");
const mobile = css.slice(css.indexOf("@media (max-width: 640px)"));

test("a navegação no celular é uma linha com rolagem horizontal", () => {
  const nav = /\.primary-nav\s*\{([^}]*)\}/.exec(mobile)?.[1] ?? "";
  expect(nav).toMatch(/display:\s*flex/);
  expect(nav).toMatch(/overflow-x:\s*auto/);
  expect(nav).not.toMatch(/grid-template-columns/);
});

test("cada item não encolhe e mantém o alvo de toque", () => {
  const item = /\.primary-nav a\s*\{([^}]*)\}/.exec(mobile)?.[1] ?? "";
  expect(item).toMatch(/flex:\s*0 0 auto/);
  expect(item).toMatch(/min-height:\s*48px/);
});
