# Skill C — responder com bash, rg, jq e sqlite3

O modo C não usa MCP. Ele combina a skill deste arquivo com a tool `bash` para ler o snapshot congelado.

## Onde está cada dado

Defina `SNAPSHOT` para a raiz recebida no trial e use somente caminhos relativos a ela:

```bash
SNAPSHOT="${SNAPSHOT:-$PWD}"
```

- `plans/PLAN-*/PLAN.md`: status, dependências e metadados do PLAN.
- `plans/PLAN-*/TASK-*.md`: contrato de cada TASK.
- `plans/PLAN-*/log.md`: tentativas, receipts e observações do PLAN.
- `runs/*.log`: saída textual das execuções.
- `runs/*.jsonl`: eventos estruturados das execuções.
- `*.db`: ledger ou estado, quando o snapshot incluir um banco SQLite.

## `rg`: buscar evidência textual

```bash
rg -n 'PLAN-0001-alpha' "$SNAPSHOT/plans"
rg -n 'tentativa.*pass' "$SNAPSHOT/plans"/*/log.md
rg -o 'step_finish' "$SNAPSHOT/runs"/*.jsonl | wc -l
```

## `jq`: consultar eventos JSONL

`jq` lê um arquivo JSONL por vez; `-s` reúne os eventos em um array:

```bash
jq -s '[.[] | select(.type == "step_finish")] | length' "$SNAPSHOT/runs"/*.jsonl
jq -s 'map(select(.type == "attempt")) | map({model, cost_usd})' "$SNAPSHOT/runs"/*.jsonl
jq -s 'group_by(.model) | map({model: .[0].model, count: length})' "$SNAPSHOT/runs"/*.jsonl
```

## `sqlite3`: consultar bancos, quando existirem

Primeiro descubra as tabelas; não assuma nomes fora do snapshot:

```bash
DB="$(find "$SNAPSHOT" -maxdepth 2 -type f -name '*.db' -print -quit)"
if [ -n "$DB" ]; then
  sqlite3 -readonly "$DB" '.tables'
  sqlite3 -readonly "$DB" 'SELECT name FROM sqlite_master WHERE type = "table";'
fi
```

## Formato da resposta

Termine com **um único bloco JSON**, sem outro JSON no texto:

```json
{"answer": "<valor exato>", "evidence": ["arquivo:linha"]}
```

O valor deve respeitar o `answer_schema` da task. Não inclua secrets, paths absolutos do workspace ou dados que não estejam no snapshot.
