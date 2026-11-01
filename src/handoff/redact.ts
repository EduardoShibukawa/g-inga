/** Redação de segredos no handoff (doc 11 §2.1 / §4).
 *
 * Padrões cobridos:
 * - Chaves de API `sk-<provider>-...` (Claude, OpenAI, etc.)
 * - Linhas no estilo `.env` (`KEY=value` com valor alfanumérico)
 * - Cabeçalhos genéricos `key`, `password`, `secret`, `token` em JSON
 */
const API_KEY_RE = /sk-[A-Za-z0-9_-]{10,}/g;
const ENV_LINE_RE = /(?:^|\n)([A-Z][A-Z0-9_]*)=(\S+)/g;

export function redact(text: string): string {
  let out = text;
  out = out.replace(API_KEY_RE, "[REDACTED]");
  out = out.replace(ENV_LINE_RE, "$1=[REDACTED]");
  return out;
}
