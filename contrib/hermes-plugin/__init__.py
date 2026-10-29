"""Plugin do Hermes (PLAN-0011 TASK-05): traduz entrada do Hermes em verbos do
ginga de forma determinística (sem LLM). Contrato: contrib/hermes-plugin/test_inbound.py.

Superfície:
  handle(msg, deps)   tradução pura; deps = {"run": f(argv), "blocker_for":
                      f(thread_id, via) -> blocker_id|None, "allow": set[str]}
  register(ctx, deps) assina handle em ctx.on_message quando existir
  resolve_blocker(db_path, thread_id, via) consulta plan_thread + events/answers
  default_deps()      run→subprocess da CLI `ginga`; allow→$GINGA_HERMES_ALLOW

Slash: "/ginga status|inbox" (leitura, qualquer user); "/ginga pause|approve|intent"
(escrita, só allowlist; fora → "denied" sem run); fora do mapa → "unknown".
Resposta em thread com blocker pendente (só allowlist) → "answer". Resto → "llm".
argv dos verbos: ["ginga", ...verb..., "--by", user, "--via", via] — flags no fim.
"""
from __future__ import annotations

import json
import os
import sqlite3
import subprocess

Ginga = "ginga"

# Verbos do mapa (registry.ts): leitura livre; escrita só com user na allowlist.
# value = (args mínimos, args máximos) depois do verbo.
READ_VERBS = {"status": (0, 0), "inbox": (0, 0)}
WRITE_VERBS = {"approve": (1, 1), "pause": (0, 1)}
INTENT = "intent"


def _verb_argv(verb_args, user, via):
    return [Ginga, *verb_args, "--by", user, "--via", via]


def _handle_slash(tokens, user, via, allow):
    """[\"/ginga\", verbo, ...args] → dict de ação. Determinístico, sem run aqui."""
    if len(tokens) < 2:
        return {"action": "unknown", "reason": "sem verbo"}
    verb, rest = tokens[1], tokens[2:]

    if verb in READ_VERBS:
        lo, hi = READ_VERBS[verb]
        if not (lo <= len(rest) <= hi):
            return {"action": "unknown", "reason": "argumentos"}
        return {"action": "verb", "argv": _verb_argv([verb, *rest], user, via)}

    if verb == INTENT:
        if not rest:
            return {"action": "unknown", "reason": "intent sem texto"}
        if user not in allow:
            return {"action": "denied", "reason": "fora da allowlist"}
        # "/ginga intent <texto>" → verbo "intent new" com o texto num só arg.
        return {"action": "verb", "argv": _verb_argv(["intent", "new", " ".join(rest)], user, via)}

    if verb in WRITE_VERBS:
        lo, hi = WRITE_VERBS[verb]
        if not (lo <= len(rest) <= hi):
            return {"action": "unknown", "reason": "argumentos"}
        if user not in allow:
            return {"action": "denied", "reason": "fora da allowlist"}
        return {"action": "verb", "argv": _verb_argv([verb, *rest], user, via)}

    return {"action": "unknown", "reason": "verbo fora do mapa"}


def handle(msg, deps):
    """msg → {"action": verb|answer|denied|unknown|llm, ...}. run só em verb/answer."""
    text = (msg.get("text") or "").strip()
    user = msg.get("user")
    via = msg.get("via")
    thread_id = msg.get("thread_id")
    allow = deps.get("allow") or set()
    run = deps["run"]

    if text.startswith("/ginga"):
        out = _handle_slash(text.split(), user, via, allow)
        if out["action"] == "verb":
            run(out["argv"])
        return out

    if thread_id and text:
        blocker = deps["blocker_for"](thread_id, via)
        if blocker:
            if user not in allow:
                return {"action": "denied", "reason": "fora da allowlist"}
            argv = _verb_argv(["answer", blocker, text], user, via)
            run(argv)
            return {"action": "answer", "argv": argv}

    return {"action": "llm"}


def _tables_ok(conn):
    return {
        r[0]
        for r in conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table'"
        ).fetchall()
    }


def resolve_blocker(db_path, thread_id, via):
    """Último blocker do PLAN daquela thread ainda sem resposta; None se não há.

    plan_thread dá o PLAN pela (thread_id, target=via); events (kind='blocker')
    ordenados por ts trazem os blocker_ids; answers exclui os respondidos.
    Sem db ou sem tabelas → None (nunca levanta).
    """
    if not db_path or not thread_id or not os.path.exists(db_path):
        return None
    conn = None
    try:
        conn = sqlite3.connect(db_path)
        tables = _tables_ok(conn)
        if not {"events", "plan_thread", "answers"} <= tables:
            return None
        row = conn.execute(
            "SELECT plan FROM plan_thread WHERE thread_id = ? AND target = ?",
            (thread_id, via),
        ).fetchone()
        if not row or row[0] is None:
            return None
        answered = {
            r[0] for r in conn.execute("SELECT blocker_id FROM answers").fetchall()
        }
        for (raw,) in conn.execute(
            "SELECT json FROM events WHERE kind = 'blocker' AND plan = ? "
            "ORDER BY ts DESC, id DESC",
            (row[0],),
        ).fetchall():
            try:
                data = json.loads(raw).get("data") or {}
            except (TypeError, ValueError):
                continue
            bid = data.get("blocker_id")
            if isinstance(bid, str) and bid and bid not in answered:
                return bid
        return None
    except sqlite3.Error:
        return None
    finally:
        if conn is not None:
            try:
                conn.close()
            except sqlite3.Error:
                pass


def _default_db_path():
    env = os.environ.get("GINGA_STATE_DB")
    if env:
        return env
    return os.path.join(os.getcwd(), ".ginga", "state", "state.db")


def default_deps():
    """Deps reais: run→CLI `ginga` no PATH; allow→$GINGA_HERMES_ALLOW (csv/espaço)."""
    db_path = _default_db_path()
    allow = {
        s
        for s in (os.environ.get("GINGA_HERMES_ALLOW") or "").replace(",", " ").split()
        if s
    }

    def run(argv):
        return subprocess.run(list(argv), capture_output=True, text=True)

    def blocker_for(thread_id, via):
        return resolve_blocker(db_path, thread_id, via)

    return {"run": run, "blocker_for": blocker_for, "allow": allow}


def register(ctx, deps=None):
    """Assina handle em ctx.on_message quando existir; ctx sem hook não levanta."""
    bound = deps if deps is not None else default_deps()

    def handler(message):
        return handle(message, bound)

    on_message = getattr(ctx, "on_message", None)
    if callable(on_message):
        on_message(handler)
    return handler
