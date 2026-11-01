#!/bin/sh
# Executor stub `pi` (formato real --mode json): escreve a solução (src/ok.txt)
# no cwd (worktree da TASK) e imprime o NDJSON de sucesso.
# STUB_FAIL=1 → sai 1 sem escrever (executor que sempre falha).
printf 'pi\t%s\t%s\n' "$PWD" "$*" >> "$STUB_LOG"
if [ "${STUB_FAIL:-0}" = "1" ]; then
  echo "stub fail" >&2
  exit 1
fi
mkdir -p src
printf 'ok\n' > src/ok.txt
cat "$STUB_EXEC_OUT"
exit 0
