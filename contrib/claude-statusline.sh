#!/usr/bin/env bash
# Claude Code statusline: persiste as duas janelas de quota da assinatura.
set -euo pipefail

home="${HOME:?HOME não está definido}"
state_dir="$home/.local/state/ginga"
state_file="$state_dir/claude-rate-limits.json"
mkdir -p "$state_dir"

input="$(cat)"
if ! limits="$(printf '%s' "$input" | jq -ce '
  if (.rate_limits | type) != "object" then
    error("rate_limits ausente")
  else
    {
      rate_limits: {
        five_hour: (.rate_limits.five_hour // null),
        seven_day: (.rate_limits.seven_day // null)
      }
    }
  end
')"; then
  echo "claude-statusline: JSON sem rate_limits" >&2
  exit 1
fi

tmp="$(mktemp "$state_dir/.claude-rate-limits.XXXXXX")"
cleanup() {
  if [[ -n "${tmp:-}" ]]; then rm -f -- "$tmp"; fi
}
trap cleanup EXIT
printf '%s\n' "$limits" > "$tmp"
mv -f -- "$tmp" "$state_file"
tmp=""

five_hour="$(jq -r '.rate_limits.five_hour.used_percent // "?"' <<< "$limits")"
seven_day="$(jq -r '.rate_limits.seven_day.used_percent // "?"' <<< "$limits")"
printf 'Claude quota: 5h %s%% | 7d %s%%\n' "$five_hour" "$seven_day"
