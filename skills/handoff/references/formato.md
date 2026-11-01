# Formato do handoff

## Estrutura do arquivo HANDOFF-YYYYMMDD-HHMMSS-PLAN.md

1. **# Plano de handoff** — resumo do objetivo e do estado atual
2. **# Contexto** — arquivos relevantes, histórico de prompts, decisões
3. **# Pendências** — itens não concluídos
4. **# Notes** — decisões, preferências e hipóteses da sessão anterior
5. **# Transcript usage** — context_tokens, handoff_tokens, lastApiTs
6. **# Trigger** — `idle` | `context` | `boundary`
7. **# Profundidade (depth)** — número de handoffs encadeados

## Registro do evento

```json
{
  "v": 1,
  "kind": "handoff",
  "trigger": "cache" | "boundary" | "idle",
  "depth": 1,
  "file": "handoffs/HANDOFF-20261030-120000-PLAN-0013.md",
  "handoff_tokens": 3900,
  "context_tokens": 120000
}
```

## Abertura de sessão (`--open`)

`ginga handoff --open --runtime claude` monta o prompt, chama
`claude --bg -n "handoff:<plano>" --model <m> "<prompt>"`,
lê o id impresso e devolve `{ok, sessionRef, attachCmd}`.
