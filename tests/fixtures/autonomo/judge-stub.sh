#!/bin/sh
# Judge stub (pass): grava o veredito no formato do judge_run em
# <root>/.ginga/plans/<PLAN>/judge/<repo>.json e sai 0.
PLAN="$1"
REPO="${2:-demo}"
D="$STUB_ROOT/.ginga/plans/$PLAN/judge"
mkdir -p "$D"
# T908: o veredito vale para o HEAD da branch do PLAN (plan/NNNN), que é o
# que o `manda merge` confere; sem a branch, cai no HEAD do repo.
N=$(printf '%s' "$PLAN" | sed -n 's/^PLAN-\([0-9][0-9][0-9][0-9]\).*/\1/p')
HEAD=$(git -C "$STUB_ROOT" rev-parse "plan/$N" 2>/dev/null || git -C "$STUB_ROOT" rev-parse HEAD 2>/dev/null || echo none)
printf '{"head":"%s","judge":{"verdict":"pass","items":[{"ref":"AC","ok":true,"regression":false,"evidence":"stub","severity":"simples"}],"summary":"stub pass"}}\n' "$HEAD" > "$D/$REPO.json"
printf 'judge\t%s\t%s\n' "$PLAN" "$REPO" >> "$STUB_LOG"
echo "{\"judge\":\"$D/$REPO.json\"}"
exit 0
