# Eventos v1

Spec do envelope de eventos entre as ferramentas (manda, pinga, ginga, gira, …).
Spec fonte em documento: `.ginga/knowledge/design/ginga-revamp/07-eventos.md`. Este
arquivo só resenha o contrato; o schema machine-readable é `schemas/events-v1.json`.

## Transporte

- `$GINGA_EVENTS` definido → append de uma linha JSON por evento nesse caminho (JSONL, UTF-8, `\n` no fim). Uma linha por `write()` com `O_APPEND`, abaixo de 4 KiB, para ser atômica entre processos.
- Não definido → nada é emitido e a ferramenta funciona igual.
- Consumo a partir de offset salvo no `state.db`; o arquivo nunca é reescrito.

## Envelope

Obrigatórios: `v` (1), `ts` (ISO 8601 estrito em UTC, com `Z`: `YYYY-MM-DDTHH:MM:SS(.sss)?Z`), `source`, `kind`, `id` (ULID, 26 chars Crockford base32).
Opcionais, preencher os que existirem: `repo`, `intent`, `spec`, `plan`, `task` — agregam custo e falhas por SPEC/PLAN/TASK. Campos desconhecidos são ignorados; mudanças incompatíveis sobem o `v`.

## Kinds e `data`

| kind | Emissor | `data` |
|---|---|---|
| `attempt` | manda | `runtime`, `provider`, `model`, `family`, `tier`, `attempt_n`, `passed` (bool), `failure` (`done_when`, `quota_exhausted`, `timeout`, `infra`, `judge`), `duration_ms`, `tokens_in`, `tokens_out`, `cost_usd`, `cost_source` |
| `receipt` | pinga | `ledger_n` (*), `hash` (*), `status` (`pass`, `fail`, `blocked`, `not run`), `reason_code`, `check` (`prove-red`, `verify`, `judge`, `bdd`, `plan`) |

(*) `ledger_n` e `hash` são obrigatórios exceto quando `check: "bdd"` (BDD do pi-harness não tem ledger). `check: "plan"` cobre receipts de PLAN do pinga.
| `transition` | ginga / manda | `entity` (`spec`, `plan`, `task`), `from`, `to`, `by` (`owner`, `system`, `<papel>`), `via` (`web`, `discord`, `telegram`, `cli`, `tui`) |
| `blocker` | manda / papéis | `blocker_id`, `question`, `options[]`, `raised_by` |
| `answer` | ginga | `blocker_id`, `answer`, `by`, `via` |
| `budget` | manda / ginga | `scope` (`task`, `plan`, `month`), `spent_usd`, `cap_usd`, `level` (`warn`, `cap`) |
| `quota` | ginga | `provider`, `used_pct`, `window_minutes`, `resets_at`, `source` |
| `handoff` | ginga | `trigger` (`boundary`, `context`, `cache`), `context_tokens`, `handoff_tokens`, `est_saved_usd`, `file` |
| `learning` | sessão / ginga | `learning_id`, `status` (`confirmada`, `descartada`, `fato`, `armadilha`), `promoted` (bool) |

## Uso no ginga

- Emitir: `emitEvent(ev)` (`src/events/emit.ts`) completa `v`, `ts` e `id` quando faltam.
- Validar: `validateEvent(ev)` (`src/events/validate.ts`) checa o envelope e o `data` por `kind`; campos desconhecidos passam.
- CLI: `ginga events validate <arquivo.jsonl>` — sai 0 se todos os eventos forem válidos; sai 1 e imprime `linha <n>: <erros>` pela primeira linha inválida.
