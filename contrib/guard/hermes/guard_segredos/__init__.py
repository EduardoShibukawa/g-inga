"""Plugin Hermes do guard de segredos. Um só casador: chama `bun src/guard/cli.ts` (fonte única de regras)."""
from __future__ import annotations

import json
import os
import shutil
import subprocess
from typing import Any, Dict, Optional

_HERE = os.path.dirname(os.path.realpath(__file__))
_CLI = os.environ.get("GINGA_GUARD_CLI") or os.path.normpath(os.path.join(_HERE, "..", "..", "..", "..", "src", "guard", "cli.ts"))
_BUN = os.environ.get("GINGA_GUARD_BUN") or shutil.which("bun") or "bun"
_TIMEOUT_S = 5


def _active() -> bool:
    return bool(os.environ.get("GINGA_GUARD_LANE")) and os.environ.get("GINGA_GUARD", "enforce") != "off"


def _run(verb: str, payload: str) -> subprocess.CompletedProcess:
    return subprocess.run([_BUN, _CLI, verb], input=payload, text=True, capture_output=True, timeout=_TIMEOUT_S, check=False)


def pre_tool_call(tool_name: str = "", args: Optional[Dict[str, Any]] = None, **_kw: Any) -> Optional[Dict[str, str]]:
    if not _active():
        return None
    try:
        p = _run("check", json.dumps({"tool": tool_name, "input": args or {}, "cwd": os.getcwd()}))
    except Exception:
        return {"action": "block", "message": "guard-segredos: falha ao consultar o guard (fail-closed)"}
    if p.returncode == 0:
        return None
    try:
        d = json.loads(p.stdout)
        msg = f"guard-segredos: {d['reason']} [{d['rule']}]"
    except Exception:
        msg = "guard-segredos: falha interna do guard (fail-closed)"
    return {"action": "block", "message": msg}


def transform_tool_result(tool_name: str = "", args: Any = None, result: Any = None, **_kw: Any) -> Optional[str]:
    if not _active() or not isinstance(result, str):
        return None
    try:
        p = _run("redact", result)
    except Exception:
        return "[REDACTED:guard_error]"
    if p.returncode != 0:
        return "[REDACTED:guard_error]"
    return p.stdout if p.stdout != result else None


def register(ctx: Any) -> None:
    ctx.register_hook("pre_tool_call", pre_tool_call)
    ctx.register_hook("transform_tool_result", transform_tool_result)
