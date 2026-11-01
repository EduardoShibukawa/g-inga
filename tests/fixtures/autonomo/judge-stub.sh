#!/bin/sh
# Judge stub (pass): grava o veredito no formato do judge_run em
# <root>/.ginga/plans/<PLAN>/judge/<repo>.json e sai 0.
PLAN="$1"
REPO="${2:-demo}"
D="$STUB_ROOT/.ginga/plans/$PLAN/judge"
mkdir -p "$D"
HEAD=$(git -C "$STUB_ROOT" rev-parse HEAD 2>/dev/null || echo none)
printf '{"head":"%s","judge":{"verdict":"pass","items":[{"ref":"AC","ok":true,"regression":false,"evidence":"stub","severity":"simples"}],"summary":"stub pass"}}\n' "$HEAD" > "$D/$REPO.json"
printf 'judge\t%s\t%s\n' "$PLAN" "$REPO" >> "$STUB_LOG"
echo "{\"judge\":\"$D/$REPO.json\"}"
exit 0
