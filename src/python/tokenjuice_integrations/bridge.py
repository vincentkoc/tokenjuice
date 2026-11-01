"""Pass captured output to tokenjuice; never execute the command in the payload."""
import asyncio
import json
import os
import subprocess

MAX_INPUT_BYTES = 2_000_000


def compact_result(source, result, *, launcher=None, timeout=5):
    if not isinstance(result, dict) or type(result.get("exitCode")) is not int or result["exitCode"] != 0:
        return None
    if not isinstance(result.get("output"), str) or not isinstance(result.get("command"), str):
        return None
    try:
        payload = json.dumps({"source": source, "result": result}).encode("utf-8")
        if len(payload) > MAX_INPUT_BYTES:
            return None
        command = list(launcher) if launcher is not None else [os.environ.get("TOKENJUICE_BIN", "tokenjuice")]
        completed = subprocess.run(
            [*command, "compact-shell-result"], input=payload,
            stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=timeout,
            check=False, env={**os.environ, "TOKENJUICE_STATS": "off"},
        )
        if completed.returncode != 0 or len(completed.stdout) > MAX_INPUT_BYTES:
            return None
        response = json.loads(completed.stdout)
        if not isinstance(response, dict):
            return None
        text = response.get("text")
        if response.get("action") == "rewrite" and isinstance(text, str) and 0 < len(text) < len(result["output"]):
            return text
    except (OSError, ValueError, TypeError, subprocess.TimeoutExpired):
        pass
    return None


async def acompact_result(source, result, **options):
    return await asyncio.to_thread(compact_result, source, result, **options)
