#!/bin/sh
# Gate do fixture: exige veredito "pass" do judge e a solução commitada na
# main (src/ok.txt), como o merge-gate real exige receipts + judge.
PLAN="$1"
grep -q '"verdict":"pass"' "$STUB_ROOT/.ginga/plans/$PLAN/judge/"*.json 2>/dev/null || { echo "sem veredito pass" >&2; exit 1; }
git -C "$STUB_ROOT" show main:src/ok.txt 2>/dev/null | grep -q '^ok$' || { echo "sem commit na main" >&2; exit 1; }
printf 'merge\t%s\n' "$PLAN" >> "$STUB_LOG"
exit 0
