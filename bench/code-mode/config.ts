/** agentConfig — Gera config do opencode.json por modo.
 * Modos: M (MCP stdio ligado, bash OFF), C (bash ON + skill, sem MCP),
 * X1/X2 (MCP da superfície X ligado, bash OFF).
 * Sempre: permission sem escrita fora do workdir (repoDir).
 */

import { join } from "node:path";

const M_SERVER = join(import.meta.dir, "surfaces", "mcp_stdio.ts");
const X_SERVER = join(import.meta.dir, "surfaces", "x.ts");
const C_SKILL = join(import.meta.dir, "surfaces", "c-skill.md");

/**
 * Modos disponíveis.
 */
export type Mode = "M" | "C" | "X1" | "X2";

/**
 * Estrutura de retorno do agentConfig.
 */
export interface AgentConfig {
  $schema: "https://opencode.ai/config.json";
  /** Somente as ferramentas permitidas pelo modo. */
  tools: {
    bash: boolean;
    edit: false;
    write: false;
  };
  /** Servidor local do modo; C não usa MCP. */
  mcp: Record<string, unknown> | null;
  /** Escrita só dentro do workdir; rede negada. */
  permission: {
    bash: "allow" | "deny";
    edit: Record<string, "allow" | "deny">;
    webfetch: "deny";
  };
  /** Instruções/skill carregadas pelo opencode. */
  instructions: string[];
  /** Diretório de trabalho. */
  repoDir: string;
}

/**
 * Retorna a configuração do opencode.json para o modo especificado.
 *
 * @param mode - O modo (M, C, X1, X2)
 * @param o - snapshot e repoDir
 * @returns Objeto de configuração JSON
 */
export function agentConfig(mode: Mode, o: { snapshot: string; repoDir: string }): AgentConfig {
  const { snapshot, repoDir } = o;
  const permission = (bash: "allow" | "deny"): AgentConfig["permission"] => ({
    bash,
    edit: {
      "*": "deny",
      [join(repoDir, "**")]: "allow",
    },
    webfetch: "deny",
  });

  switch (mode) {
    case "M":
      return {
        $schema: "https://opencode.ai/config.json",
        tools: { bash: false, edit: false, write: false },
        mcp: {
          "code-mode-m": {
            type: "local",
            command: ["bun", M_SERVER, "--snapshot", snapshot],
            enabled: true,
          },
        },
        permission: permission("deny"),
        instructions: [],
        repoDir,
      };

    case "C":
      return {
        $schema: "https://opencode.ai/config.json",
        tools: { bash: true, edit: false, write: false },
        mcp: null,
        permission: permission("allow"),
        instructions: [C_SKILL],
        repoDir,
      };

    case "X1":
    case "X2":
      return {
        $schema: "https://opencode.ai/config.json",
        tools: { bash: false, edit: false, write: false },
        mcp: {
          "code-mode-x": {
            type: "local",
            command: ["bun", X_SERVER, "--snapshot", snapshot],
            enabled: true,
          },
        },
        permission: permission("deny"),
        instructions: [],
        repoDir,
      };
  }
}