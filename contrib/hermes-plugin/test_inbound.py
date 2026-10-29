"""Testes congelados — PLAN-0011 TASK-05 (plugin do Hermes, entrada).

Contrato determinístico do `contrib/hermes-plugin/__init__.py`:

  handle(msg, deps) -> dict com {"action": "verb"|"answer"|"denied"|"unknown"|"llm"}
    msg  = {"text": str, "user": str, "via": "discord"|"telegram", "thread_id": str|None}
    deps = {"run": f(argv: list[str]) -> Any,          # chama a CLI `ginga`, nunca reinterpreta
            "blocker_for": f(thread_id, via) -> str|None,
            "allow": set[str]}                          # user IDs com verbos de escrita

    Slash: "/ginga status|inbox|pause|approve|intent ..." — leitura livre; escrita
    só com `user` em `allow`; fora → "denied" (run não chamado); fora do mapa →
    "unknown". Resposta em thread com blocker pendente (só com allow) →
    "answer". Livre conversa → "llm" (run não chamado).

  argv dos verbos: ["ginga", ...verb..., "--by", user, "--via", via] — flags no fim.
  "/ginga intent <texto>" mapeia para o verbo "intent new" com o texto num só arg.

  resolve_blocker(db_path, thread_id, via): último blocker do PLAN daquela thread
  (plan_thread) cujo blocker_id (events.json → data.blocker_id) ainda não está em
  answers; None se não há. Sem db/tabelas → None (nunca levanta).

  register(ctx, deps=None): assina o handler em ctx.on_message quando existir;
  ctx sem hook não pode levantar. default_deps(): run/blocker_for calláveis, allow presente.

Só stdlib; sem rede; sem CLI real (run é injetado).
"""
from __future__ import annotations

import importlib.util
import os
import re
import sqlite3
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))


def load():
    spec = importlib.util.spec_from_file_location(
        "ginga_hermes_plugin", os.path.join(HERE, "__init__.py")
    )
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def deps_for(allow=(), blocker=None):
    """(calls, deps): run grava argv em calls; blocker_for devolve `blocker`."""
    calls = []

    def blocker_for(thread_id, via):
        if blocker is None:
            return None
        if callable(blocker):
            return blocker(thread_id, via)
        return blocker

    return calls, {"run": calls.append, "blocker_for": blocker_for, "allow": set(allow)}


def msg(text, user="u1", via="discord", thread_id=None):
    return {"text": text, "user": user, "via": via, "thread_id": thread_id}


class SlashRead(unittest.TestCase):
    def test_status_de_qualquer_user(self):
        mod = load()
        calls, d = deps_for(allow=())
        out = mod.handle(msg("/ginga status", user="estranho"), d)
        self.assertEqual(out["action"], "verb")
        self.assertEqual(calls, [["ginga", "status", "--by", "estranho", "--via", "discord"]])

    def test_inbox_de_qualquer_user(self):
        mod = load()
        calls, d = deps_for(allow=())
        out = mod.handle(msg("/ginga inbox", user="estranho", via="telegram"), d)
        self.assertEqual(out["action"], "verb")
        self.assertEqual(calls, [["ginga", "inbox", "--by", "estranho", "--via", "telegram"]])


class SlashWrite(unittest.TestCase):
    def test_approve_na_allowlist(self):
        mod = load()
        calls, d = deps_for(allow={"u1"})
        out = mod.handle(msg("/ginga approve 42"), d)
        self.assertEqual(out["action"], "verb")
        self.assertEqual(calls, [["ginga", "approve", "42", "--by", "u1", "--via", "discord"]])

    def test_pause_com_ou_sem_plano(self):
        mod = load()
        calls, d = deps_for(allow={"u1"})
        mod.handle(msg("/ginga pause PLAN-0011"), d)
        mod.handle(msg("/ginga pause"), d)
        self.assertEqual(
            calls,
            [
                ["ginga", "pause", "PLAN-0011", "--by", "u1", "--via", "discord"],
                ["ginga", "pause", "--by", "u1", "--via", "discord"],
            ],
        )

    def test_intent_vira_intent_new_com_texto_num_arg(self):
        mod = load()
        calls, d = deps_for(allow={"u1"})
        out = mod.handle(msg("/ginga intent quero PLAN-0012 já"), d)
        self.assertEqual(out["action"], "verb")
        self.assertEqual(
            calls,
            [["ginga", "intent", "new", "quero PLAN-0012 já", "--by", "u1", "--via", "discord"]],
        )

    def test_escrita_fora_da_allowlist_e_denied_sem_run(self):
        mod = load()
        for cmd in ("/ginga approve 42", "/ginga pause", "/ginga intent x"):
            calls, d = deps_for(allow=())
            out = mod.handle(msg(cmd, user="estranho"), d)
            self.assertEqual(out["action"], "denied", cmd)
            self.assertEqual(calls, [], cmd)

    def test_verbo_fora_do_mapa_e_unknown_sem_run(self):
        mod = load()
        for cmd in ("/ginga reject 5", "/ginga frobnicate", "/ginga", "/ginga retry P T"):
            calls, d = deps_for(allow={"u1"})
            out = mod.handle(msg(cmd), d)
            self.assertEqual(out["action"], "unknown", cmd)
            self.assertEqual(calls, [], cmd)


class ThreadAnswer(unittest.TestCase):
    def test_resposta_na_thread_vira_answer(self):
        mod = load()
        calls, d = deps_for(allow={"u1"}, blocker="B-7")
        out = mod.handle(msg("sim, pode", via="telegram", thread_id="t-1"), d)
        self.assertEqual(out["action"], "answer")
        self.assertEqual(
            calls, [["ginga", "answer", "B-7", "sim, pode", "--by", "u1", "--via", "telegram"]]
        )

    def test_thread_sem_blocker_pende_passa_para_llm(self):
        mod = load()
        calls, d = deps_for(allow={"u1"}, blocker=None)
        out = mod.handle(msg("sim, pode", thread_id="t-1"), d)
        self.assertEqual(out["action"], "llm")
        self.assertEqual(calls, [])

    def test_resposta_na_thread_fora_da_allowlist_e_denied(self):
        mod = load()
        calls, d = deps_for(allow=(), blocker="B-7")
        out = mod.handle(msg("sim, pode", user="estranho", thread_id="t-1"), d)
        self.assertEqual(out["action"], "denied")
        self.assertEqual(calls, [])

    def test_livre_conversa_sem_thread_passa_para_llm(self):
        mod = load()
        for text in ("oi, tudo bem?", "", "   "):
            calls, d = deps_for(allow={"u1"}, blocker="B-7")
            out = mod.handle(msg(text), d)
            self.assertEqual(out["action"], "llm", repr(text))
            self.assertEqual(calls, [], repr(text))


class ResolveBlocker(unittest.TestCase):
    DDL = [
        "CREATE TABLE events (id TEXT PRIMARY KEY, ts TEXT, kind TEXT, plan TEXT, task TEXT, json TEXT NOT NULL)",
        "CREATE TABLE plan_thread (plan TEXT NOT NULL, target TEXT NOT NULL, thread_id TEXT, PRIMARY KEY (plan, target))",
        'CREATE TABLE answers (blocker_id TEXT NOT NULL, answer TEXT NOT NULL, "by" TEXT NOT NULL, via TEXT, ts TEXT)',
    ]

    def db_with_rows(self):
        fd, path = tempfile.mkstemp(suffix=".db")
        os.close(fd)
        conn = sqlite3.connect(path)
        for ddl in self.DDL:
            conn.execute(ddl)
        conn.execute("INSERT INTO plan_thread VALUES('PLAN-0011','discord','t-1')")
        conn.execute("INSERT INTO plan_thread VALUES('PLAN-0011','telegram','t-2')")
        b1 = '{"kind":"blocker","plan":"PLAN-0011","data":{"blocker_id":"B-1","question":"a?","raised_by":"x"}}'
        b2 = '{"kind":"blocker","plan":"PLAN-0011","data":{"blocker_id":"B-2","question":"b?","raised_by":"x"}}'
        other = '{"kind":"gate.result","plan":"PLAN-0011","data":{}}'
        conn.execute("INSERT INTO events VALUES('E1','2026-10-29T10:00:00','blocker','PLAN-0011','T1',?)", (b1,))
        conn.execute("INSERT INTO events VALUES('E2','2026-10-29T10:05:00','blocker','PLAN-0011','T1',?)", (b2,))
        conn.execute("INSERT INTO events VALUES('E3','2026-10-29T10:06:00','gate.result','PLAN-0011','T1',?)", (other,))
        conn.execute("INSERT INTO answers VALUES('B-1','sim','u','discord','2026-10-29T10:10:00')")
        conn.commit()
        conn.close()
        return path

    def test_ultimo_blocker_sem_resposta_da_thread(self):
        mod = load()
        path = self.db_with_rows()
        try:
            self.assertEqual(mod.resolve_blocker(path, "t-1", "discord"), "B-2")
            self.assertEqual(mod.resolve_blocker(path, "t-2", "telegram"), "B-2")
            self.assertIsNone(mod.resolve_blocker(path, "t-x", "discord"))
            self.assertIsNone(mod.resolve_blocker(path, "t-1", "telegram"))
        finally:
            os.remove(path)

    def test_todos_respondidos_devolve_none(self):
        mod = load()
        path = self.db_with_rows()
        try:
            conn = sqlite3.connect(path)
            conn.execute("INSERT INTO answers VALUES('B-2','sim','u','discord','2026-10-29T10:20:00')")
            conn.commit()
            conn.close()
            self.assertIsNone(mod.resolve_blocker(path, "t-1", "discord"))
        finally:
            os.remove(path)

    def test_db_inexistente_devolve_none_sem_levantar(self):
        mod = load()
        path = os.path.join(tempfile.mkdtemp(), "nao-existe.db")
        self.assertIsNone(mod.resolve_blocker(path, "t-1", "discord"))

    def test_tabelas_ausentes_devolve_none(self):
        mod = load()
        fd, path = tempfile.mkstemp(suffix=".db")
        os.close(fd)
        try:
            self.assertIsNone(mod.resolve_blocker(path, "t-1", "discord"))
        finally:
            os.remove(path)


class Wiring(unittest.TestCase):
    def test_register_assina_em_on_message_quando_existe(self):
        mod = load()

        class Ctx:
            handler = None

            def on_message(self, fn):
                Ctx.handler = fn

        ctx = Ctx()
        mod.register(ctx)
        self.assertTrue(callable(Ctx.handler))

    def test_register_com_ctx_sem_hook_nao_levanta(self):
        mod = load()
        mod.register(object())

    def test_default_deps_tem_run_blocker_for_allow(self):
        mod = load()
        d = mod.default_deps()
        self.assertTrue(callable(d["run"]))
        self.assertTrue(callable(d["blocker_for"]))
        self.assertIn("allow", d)

    def test_plugin_yaml_existe_com_name(self):
        path = os.path.join(HERE, "plugin.yaml")
        self.assertTrue(os.path.exists(path))
        with open(path, encoding="utf-8") as fh:
            text = fh.read()
        self.assertRegex(text, re.compile(r"^name:[ \t]*ginga[ \t]*$", re.M))


if __name__ == "__main__":
    unittest.main()
