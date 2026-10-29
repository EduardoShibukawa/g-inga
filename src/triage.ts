// Triagem de trilha (doc 02 §4/§5): critérios determinísticos, sem LLM nesta
// versão. Na dúvida → feature. Triagem não rebaixa: a flag "small" só autoriza
// a trilha pequena quando nenhuma evidência aponta para feature.

export type TriageTrack = "small" | "feature";

export type TriageInput = {
  flag?: string; // flag do usuário: "small" | "feature"
  files?: number; // nº de arquivos que o trabalho toca
  impact?: number; // nº de itens impactados (ex.: via `manda context impact`)
  newContract?: boolean; // o trabalho abre contrato novo
};

export type TriageResult = { track: TriageTrack; reasons: string[] };

export const FILES_LIMIT = 3;
export const IMPACT_LIMIT = 5;

export function triage(input: TriageInput = {}): TriageResult {
  const { flag, files, impact, newContract } = input;

  const evidence: string[] = [];
  if (flag === "feature") evidence.push("flag do usuário: feature");
  if (newContract) evidence.push("contrato novo");
  if (files !== undefined && files > FILES_LIMIT) evidence.push(`files=${files} > ${FILES_LIMIT}`);
  if (impact !== undefined && impact > IMPACT_LIMIT) evidence.push(`impact=${impact} > ${IMPACT_LIMIT}`);
  if (evidence.length > 0) return { track: "feature", reasons: evidence };

  if (flag === "small") return { track: "small", reasons: ["flag do usuário: small", "nenhuma evidência de feature"] };

  if (files !== undefined) {
    const reasons = [`files=${files} ≤ ${FILES_LIMIT}`];
    reasons.push(impact === undefined ? "impact ausente" : `impact=${impact} ≤ ${IMPACT_LIMIT}`);
    return { track: "small", reasons };
  }

  return { track: "feature", reasons: ["sem informação suficiente — na dúvida, feature"] };
}
