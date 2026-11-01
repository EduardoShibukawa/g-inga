#!/bin/sh
# Replan stub: registra a chamada (o replan real chamaria um planner LLM).
printf 'replan\t%s\t%s\n' "$1" "$2" >> "$STUB_LOG"
exit 0
