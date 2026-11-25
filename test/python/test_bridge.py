"""Bridge launcher resolution and failure reporting (issue #464)."""
import json
import os
import stat
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "src" / "python"))

from tokenjuice_integrations import bridge  # noqa: E402

EXECUTION = {"command": "git log --oneline -200", "output": "x" * 4000, "exitCode": 0}


def touch(path, body="", executable=False):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(body)
    if executable:
        path.chmod(path.stat().st_mode | stat.S_IXUSR)
    return str(path)


class ResolveLauncherTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)

    def tearDown(self):
        self.tmp.cleanup()

    def test_windows_resolves_npm_cmd_shim_not_extensionless_script(self):
        npm = self.root / "npm"
        touch(npm / "tokenjuice")
        cmd = touch(npm / "tokenjuice.cmd")
        touch(npm / "tokenjuice.ps1")
        env = {"PATH": f"{self.root / 'other'};{npm}", "PATHEXT": ".COM;.EXE;.BAT;.CMD"}
        self.assertEqual(bridge.resolve_launcher(env, windows=True), [cmd])

    def test_windows_follows_pathext_order(self):
        exe = touch(self.root / "a" / "tokenjuice.exe")
        touch(self.root / "a" / "tokenjuice.cmd")
        env = {"PATH": str(self.root / "a"), "PATHEXT": ".EXE;.CMD"}
        self.assertEqual(bridge.resolve_launcher(env, windows=True), [exe])

    def test_windows_defaults_pathext_and_ignores_relative_entries(self):
        relative = Path("tj-relative-path-entry")
        self.addCleanup(lambda: (relative / "tokenjuice.cmd").unlink(missing_ok=True) or relative.rmdir())
        touch(relative / "tokenjuice.cmd")
        cmd = touch(self.root / "bin" / "tokenjuice.cmd")
        env = {"PATH": f"{relative};;\"{self.root / 'bin'}\""}
        self.assertEqual(bridge.resolve_launcher(env, windows=True), [cmd])

    def test_explicit_bin_wins(self):
        touch(self.root / "tokenjuice.cmd")
        env = {"PATH": str(self.root), "TOKENJUICE_BIN": r"C:\tools\tokenjuice.cmd"}
        self.assertEqual(bridge.resolve_launcher(env, windows=True), [r"C:\tools\tokenjuice.cmd"])

    def test_unresolved_and_posix_keep_bare_name(self):
        self.assertEqual(bridge.resolve_launcher({"PATH": str(self.root)}, windows=True), ["tokenjuice"])
        touch(self.root / "tokenjuice", executable=True)
        self.assertEqual(bridge.resolve_launcher({"PATH": str(self.root)}, windows=False), ["tokenjuice"])


class CompactResultTest(unittest.TestCase):
    def setUp(self):
        bridge._reported.clear()
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)

    def tearDown(self):
        self.tmp.cleanup()
        bridge._reported.clear()

    def test_default_launcher_uses_resolution(self):
        response = json.dumps({"action": "rewrite", "text": "short"}).encode()
        with patch.object(bridge, "resolve_launcher", return_value=[r"C:\npm\tokenjuice.cmd"]), \
                patch("subprocess.run", return_value=subprocess.CompletedProcess([], 0, response, b"")) as run:
            self.assertEqual(bridge.compact_result("hermes", EXECUTION), "short")
        self.assertEqual(run.call_args.args[0], [r"C:\npm\tokenjuice.cmd", "compact-shell-result"])

    def test_spawn_failure_is_reported_once(self):
        missing = [str(self.root / "missing-tokenjuice")]
        with self.assertLogs("tokenjuice", "WARNING") as logs:
            self.assertIsNone(bridge.compact_result("hermes", EXECUTION, launcher=missing))
            self.assertIsNone(bridge.compact_result("hermes", EXECUTION, launcher=missing))
        self.assertEqual(len(logs.output), 1)
        self.assertIn("could not start", logs.output[0])
        self.assertIn("TOKENJUICE_BIN", logs.output[0])

    def test_nonzero_exit_reports_stderr(self):
        failed = subprocess.CompletedProcess([], 2, b"", b"boom\nlast line\n")
        with patch("subprocess.run", return_value=failed), self.assertLogs("tokenjuice", "WARNING") as logs:
            self.assertIsNone(bridge.compact_result("hermes", EXECUTION, launcher=["tj"]))
        self.assertIn("exited with status 2: last line", logs.output[0])

    def test_timeout_is_reported(self):
        with patch("subprocess.run", side_effect=subprocess.TimeoutExpired("tj", 5)), \
                self.assertLogs("tokenjuice", "WARNING") as logs:
            self.assertIsNone(bridge.compact_result("hermes", EXECUTION, launcher=["tj"]))
        self.assertIn("timed out", logs.output[0])

    @unittest.skipIf(os.name == "nt", "POSIX launcher fixture")
    def test_real_launcher_round_trip(self):
        script = touch(self.root / "tokenjuice", "#!/bin/sh\ncat >/dev/null\n"
                       "printf '{\"action\":\"rewrite\",\"text\":\"compact\"}'\n", executable=True)
        self.assertEqual(bridge.compact_result("hermes", EXECUTION, launcher=[script]), "compact")


if __name__ == "__main__":
    unittest.main()
