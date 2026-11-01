"""Pinned Hermes plugin discovery, terminal replacement, and native agent requests."""
import json
import os
from pathlib import Path
import shutil
import sys
import tempfile
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

vendor = Path(sys.argv[1]).resolve()
dist = Path(sys.argv[2]).resolve() if len(sys.argv) > 2 else Path(__file__).resolve().parents[1] / "dist"
sys.path.insert(0, str(vendor))

with tempfile.TemporaryDirectory(prefix="tokenjuice-hermes-native-") as temp:
    root = Path(temp)
    home = root / "home"
    home.mkdir()
    bundled = root / "bundled"
    bundled.mkdir()
    os.environ.update({"HERMES_HOME": str(home), "HERMES_BUNDLED_PLUGINS": str(bundled),
                       "HERMES_ENABLE_PROJECT_PLUGINS": "0", "TOKENJUICE_STATS": "off",
                       "TERMINAL_ENV": "local", "TERMINAL_CWD": str(root)})
    # The executable trampoline is task-owned. No shell parses bridge payloads.
    launcher = root / "tokenjuice"
    launcher.write_text(f'#!/bin/sh\nexec node "{dist / "cli/main.js"}" "$@"\n')
    launcher.chmod(0o755)
    os.environ["TOKENJUICE_BIN"] = str(launcher)
    plugin = home / "plugins/tokenjuice"
    shutil.copytree(dist / "hosts/hermes/bundle", plugin)
    (home / "config.yaml").write_text("plugins:\n  enabled: [tokenjuice]\n  disabled: []\n")
    from hermes_cli.plugin_dev import doctor_plugin
    report = doctor_plugin(plugin)
    assert report.ok, str(report)
    assert "transform_terminal_output" in report.registered_hooks
    from hermes_cli.plugins import discover_plugins, invoke_hook
    discover_plugins()
    raw = "\n".join(f"fixtures/example-{i}.json" for i in range(80))
    transformed = invoke_hook("transform_terminal_output", command="find fixtures -type f", output=raw, returncode=0, env_type="local", task_id="fixture")
    assert len(transformed) == 1 and "80 matches" in transformed[0]
    for code, env_type in [(7, "local"), (None, "local"), (0, "")]:
        assert not invoke_hook("transform_terminal_output", command="find fixtures -type f", output=raw, returncode=code, env_type=env_type, task_id="fixture")

    (root / "fixtures").mkdir()
    for i in range(80):
        (root / f"fixtures/example-{i}.json").write_text("{}")
    (root / "exact.txt").write_text(raw)
    commands = ["find fixtures -type f", "cat exact.txt",
                f"'{launcher}' wrap --raw -- find fixtures -type f",
                "for i in $(seq 0 79); do printf 'failure-%s\\n' \"$i\"; done; printf 'failure-stderr\\n' >&2; exit 7"]
    requests = []
    selected = 0

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *args):
            pass

        def do_POST(self):
            payload = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
            assert self.path == "/v1/chat/completions", self.path
            requests.append(payload)
            result = next((m for m in reversed(payload["messages"]) if m["role"] == "tool"), None)
            message = {"role": "assistant", "content": "fixture complete"}
            if result is None:
                message = {"role": "assistant", "content": None, "tool_calls": [{"id": "native-call", "type": "function", "function": {"name": "terminal", "arguments": json.dumps({"command": commands[selected]})}}]}
            data = {"id": "fixture", "object": "chat.completion", "created": 0, "model": "fixture", "choices": [{"index": 0, "message": message, "finish_reason": "tool_calls" if result is None else "stop"}], "usage": {"prompt_tokens": 1, "completion_tokens": 1, "total_tokens": 2}}
            if payload.get("stream"):
                self.send_response(200)
                self.send_header("Content-Type", "text/event-stream")
                self.end_headers()
                delta = {**message}
                if "tool_calls" in delta:
                    delta["tool_calls"] = [{"index": 0, **call} for call in delta["tool_calls"]]
                for part, reason in [(delta, None), ({}, data["choices"][0]["finish_reason"])]:
                    chunk = {**data, "object": "chat.completion.chunk", "choices": [{"index": 0, "delta": part, "finish_reason": reason}]}
                    self.wfile.write(f"data: {json.dumps(chunk)}\n\n".encode())
                self.wfile.write(b"data: [DONE]\n\n")
                return
            encoded = json.dumps(data).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(encoded)))
            self.end_headers()
            self.wfile.write(encoded)

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    previous = Path.cwd()
    try:
        os.chdir(root)
        from run_agent import AIAgent
        for selected in range(len(commands)):
            requests.clear()
            agent = AIAgent(base_url=f"http://127.0.0.1:{server.server_port}/v1", api_key="fixture", provider="openai", api_mode="chat_completions", model="fixture",
                            enabled_toolsets=["terminal"], max_iterations=3, quiet_mode=True,
                            skip_context_files=True, load_soul_identity=False)
            agent.run_conversation("run the fixture")
            messages = [m for request in requests for m in request["messages"] if m["role"] == "tool"]
            assert messages, "native follow-up model request must contain a terminal result"
            assert messages[-1]["tool_call_id"] == "native-call"
            envelope = json.loads(messages[-1]["content"])
            assert envelope["exit_code"] == (7 if selected == 3 else 0)
            content = envelope["output"]
            if selected == 0:
                assert "80 matches" in content and len(content) < len(raw)
            elif selected == 3:
                for i in range(80):
                    assert f"failure-{i}\n" in content
                assert "failure-stderr" in content
            else:
                for i in range(80):
                    assert f"fixtures/example-{i}.json" in content
        # Native removal unloads only this fixture plugin.
        from hermes_cli.plugins_cmd_remove import cmd_remove
        cmd_remove("tokenjuice")
        assert not plugin.exists()
        discover_plugins(force=True)
        assert not invoke_hook("transform_terminal_output", command=commands[0], output=raw, returncode=0, env_type="local")
        print("native Hermes plugin lifecycle and model request contracts passed")
    finally:
        os.chdir(previous)
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)
