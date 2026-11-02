export type CMTask = {
  id: string;
  level: "direta" | "juncao" | "agregacao" | "multihop";
  trap: boolean;
  heavy: boolean;
  question: string;
  answer_schema: object;
};

/** As dez perguntas do experimento de code mode (H5). */
export const TASKS: CMTask[] = [
  {
    id: "t01",
    level: "direta",
    trap: false,
    heavy: false,
    question: "Qual é o status do PLAN-0001-alpha?",
    answer_schema: { type: "string", enum: ["draft", "approved", "done"] },
  },
  {
    id: "t02",
    level: "direta",
    trap: false,
    heavy: false,
    question: "Quantos arquivos TASK-*.md pertencem ao PLAN-0001-alpha?",
    answer_schema: { type: "integer", minimum: 0 },
  },
  {
    id: "t03",
    level: "juncao",
    trap: false,
    heavy: false,
    question:
      "Qual PLAN, TASK e lista touch correspondem à TASK que passou na tentativa 1 com o modelo pi:m1?",
    answer_schema: {
      type: "object",
      properties: {
        plan: { type: "string" },
        task: { type: "string" },
        touch: { type: "array", items: { type: "string" } },
      },
      required: ["plan", "task", "touch"],
    },
  },
  {
    id: "t04",
    level: "agregacao",
    trap: false,
    heavy: false,
    question:
      "Qual foi o custo pago total por modelo, somando as linhas de tentativa paga dos log.md?",
    answer_schema: {
      type: "object",
      additionalProperties: { type: "number" },
    },
  },
  {
    id: "t05",
    level: "agregacao",
    trap: false,
    heavy: false,
    question:
      "Para cada modelo, quantas tentativas houve, quantas passaram e qual foi a taxa de pass?",
    answer_schema: {
      type: "object",
      additionalProperties: {
        type: "object",
        properties: {
          attempts: { type: "integer" },
          pass: { type: "integer" },
          rate: { type: "number" },
        },
        required: ["attempts", "pass", "rate"],
      },
    },
  },
  {
    id: "t06",
    level: "agregacao",
    trap: false,
    heavy: true,
    question: "Quantos arquivos runs/*.log contêm a frase Free usage limit?",
    answer_schema: { type: "integer", minimum: 0 },
  },
  {
    id: "t07",
    level: "agregacao",
    trap: false,
    heavy: true,
    question: "Qual é o total de eventos step_finish nos arquivos runs/*.jsonl?",
    answer_schema: { type: "integer", minimum: 0 },
  },
  {
    id: "t08",
    level: "multihop",
    trap: false,
    heavy: false,
    question:
      "Quais PLANs dependem, direta ou transitivamente, de um PLAN cujo status é draft?",
    answer_schema: { type: "array", items: { type: "string" } },
  },
  {
    id: "t09",
    level: "juncao",
    trap: true,
    heavy: false,
    question:
      "Quais tentativas pagas nos log.md têm custo US$ 0? Informe PLAN, TASK e custo.",
    answer_schema: {
      type: "array",
      items: {
        type: "object",
        properties: {
          plan: { type: "string" },
          task: { type: "string" },
          cost: { type: "number" },
        },
        required: ["plan", "task", "cost"],
      },
    },
  },
  {
    id: "t10",
    level: "juncao",
    trap: true,
    heavy: false,
    question:
      "Quais TASKs citadas em log.md não têm arquivo TASK-*.md no mesmo PLAN?",
    answer_schema: { type: "array", items: { type: "string" } },
  },
];

export { oracle, verify } from "./oracle";
