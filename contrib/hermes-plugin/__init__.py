"""Plugin do Hermes (PLAN-0011 TASK-05): traduz entrada do Hermes em verbos do
ginga de forma determinística (sem LLM). Stub RED — implementar o contrato de
contrib/hermes-plugin/test_inbound.py.

Superfície (contrato congelado):
  handle(msg, deps)   tradução pura; deps = {"run": f(argv), "blocker_for":
                      f(thread_id, via) -> blocker_id|None, "allow": set[str]}
  register(ctx, deps) assina handle em ctx.on_message quando existir
  resolve_blocker(db_path, thread_id, via) consulta plan_thread + events/answers
  default_deps()      run→subprocess da CLI `ginga`; allow→$GINGA_HERMES_ALLOW
"""
from __future__ import annotations


def handle(msg, deps):
    raise NotImplementedError("RED stub: implementar handle (TASK-05/PLAN-0011)")


def register(ctx, deps=None):
    raise NotImplementedError("RED stub: implementar register (TASK-05/PLAN-0011)")


def resolve_blocker(db_path, thread_id, via):
    raise NotImplementedError("RED stub: implementar resolve_blocker (TASK-05/PLAN-0011)")


def default_deps():
    raise NotImplementedError("RED stub: implementar default_deps (TASK-05/PLAN-0011)")
