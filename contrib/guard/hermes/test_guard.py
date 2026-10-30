import importlib.util, os, shutil, tempfile, unittest

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("guard_segredos", os.path.join(HERE, "guard_segredos", "__init__.py"))
g = importlib.util.module_from_spec(spec); spec.loader.exec_module(g)


class Ctx:
    def __init__(self): self.hooks = {}
    def register_hook(self, name, fn): self.hooks[name] = fn


class GuardHermes(unittest.TestCase):
    def setUp(self):
        self.root = tempfile.mkdtemp(prefix="guard-hermes-")
        self.cwd = os.path.join(self.root, "work"); self.home = os.path.join(self.root, "home")
        os.makedirs(self.cwd); os.makedirs(os.path.join(self.home, ".pi", "agent"))
        open(os.path.join(self.cwd, ".env"), "w").write("FAKE=1\n")
        open(os.path.join(self.cwd, "README.md"), "w").write("oi\n")
        self.old = (os.getcwd(), dict(os.environ)); os.chdir(self.cwd)
        os.environ["HOME"] = self.home; os.environ["GINGA_GUARD_LANE"] = "lane-test"; os.environ.pop("GINGA_GUARD", None)
        self.ctx = Ctx(); g.register(self.ctx)
        self.pre = self.ctx.hooks["pre_tool_call"]; self.post = self.ctx.hooks["transform_tool_result"]

    def tearDown(self):
        os.chdir(self.old[0]); os.environ.clear(); os.environ.update(self.old[1]); shutil.rmtree(self.root, ignore_errors=True)

    def test_registra_os_dois_hooks(self):
        self.assertEqual(set(self.ctx.hooks), {"pre_tool_call", "transform_tool_result"})

    def test_cat_env_barrado(self):
        r = self.pre(tool_name="terminal", args={"command": "cat .env"})
        self.assertEqual(r["action"], "block"); self.assertIn("guard-segredos", r["message"]); self.assertNotIn("fail-closed", r["message"])

    def test_cat_auth_json_do_pi_barrado(self):
        r = self.pre(tool_name="terminal", args={"command": "cat ~/.pi/agent/auth.json"})
        self.assertEqual(r["action"], "block"); self.assertNotIn("fail-closed", r["message"])

    def test_read_file_env_barrado(self):
        self.assertEqual(self.pre(tool_name="read_file", args={"path": ".env"})["action"], "block")

    def test_cat_readme_passa(self):
        self.assertIsNone(self.pre(tool_name="terminal", args={"command": "cat README.md"}))

    def test_fora_de_lane_inerte(self):
        del os.environ["GINGA_GUARD_LANE"]
        self.assertIsNone(self.pre(tool_name="terminal", args={"command": "cat .env"}))

    def test_cli_ausente_bloqueia_fail_closed(self):
        old = g._CLI; g._CLI = "/nao/existe/cli.ts"
        try: self.assertEqual(self.pre(tool_name="terminal", args={"command": "ls"})["action"], "block")
        finally: g._CLI = old

    def test_resultado_com_chave_e_redigido(self):
        key = "nvapi-" + "A" * 48
        out = self.post(tool_name="terminal", args={}, result="saida " + key)
        self.assertIsInstance(out, str); self.assertNotIn(key, out)

    def test_resultado_limpo_retorna_none(self):
        self.assertIsNone(self.post(tool_name="terminal", args={}, result="ok"))


if __name__ == "__main__":
    unittest.main()
