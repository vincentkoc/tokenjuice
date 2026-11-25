"""Pass captured output to tokenjuice; never execute the command in the payload."""
import asyncio
import json
import logging
import os
import subprocess

MAX_INPUT_BYTES = 2_000_000
DEFAULT_PATHEXT = ".COM;.EXE;.BAT;.CMD"

logger = logging.getLogger("tokenjuice")
_reported = set()


def _find_on_path(name, path, separator):
    # Absolute PATH entries only: never pick up a launcher from the working directory.
    for directory in (path or "").split(separator):
        directory = directory.strip().strip('"')
        if not directory or not os.path.isabs(directory):
            continue
        candidate = os.path.join(directory, name)
        if os.path.isfile(candidate):
            return candidate
    return None


def resolve_launcher(env=None, *, windows=None):
    """Return the tokenjuice CLI argv prefix.

    TOKENJUICE_BIN wins. On Windows, npm installs `tokenjuice.cmd` and no `.exe`, and
    CreateProcess does not apply PATHEXT to a bare name, so resolve the shim explicitly.
    """
    env = os.environ if env is None else env
    explicit = env.get("TOKENJUICE_BIN")
    if explicit:
        return [explicit]
    windows = os.name == "nt" if windows is None else windows
    if windows:
        for ext in (env.get("PATHEXT") or DEFAULT_PATHEXT).split(";"):
            ext = ext.strip()
            if ext.startswith("."):
                found = _find_on_path(f"tokenjuice{ext.lower()}", env.get("PATH"), ";")
                if found:
                    return [found]
    return ["tokenjuice"]


def _report(kind, message):
    # Failures preserve the original output; say why once per process and kind.
    if kind in _reported:
        return
    _reported.add(kind)
    logger.warning("tokenjuice: %s; output left uncompacted", message)


def compact_result(source, result, *, launcher=None, timeout=5):
    if not isinstance(result, dict) or type(result.get("exitCode")) is not int or result["exitCode"] != 0:
        return None
    if not isinstance(result.get("output"), str) or not isinstance(result.get("command"), str):
        return None
    command = None
    try:
        payload = json.dumps({"source": source, "result": result}).encode("utf-8")
        if len(payload) > MAX_INPUT_BYTES:
            return None
        command = list(launcher) if launcher is not None else resolve_launcher()
        completed = subprocess.run(
            [*command, "compact-shell-result"], input=payload,
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=timeout,
            check=False, env={**os.environ, "TOKENJUICE_STATS": "off"},
        )
        if completed.returncode != 0:
            detail = (completed.stderr or b"").decode("utf-8", "replace").strip().splitlines()
            _report("exit", f"{command[0]} exited with status {completed.returncode}"
                    + (f": {detail[-1][:200]}" if detail else ""))
            return None
        if len(completed.stdout) > MAX_INPUT_BYTES:
            return None
        response = json.loads(completed.stdout)
        if not isinstance(response, dict):
            return None
        text = response.get("text")
        if response.get("action") == "rewrite" and isinstance(text, str) and 0 < len(text) < len(result["output"]):
            return text
    except OSError as error:
        name = command[0] if command else "tokenjuice"
        _report("spawn", f"could not start {name} ({error}); install the CLI or set TOKENJUICE_BIN")
    except subprocess.TimeoutExpired:
        _report("timeout", f"compact-shell-result timed out after {timeout}s")
    except (ValueError, TypeError) as error:
        _report("response", f"invalid compact-shell-result response ({error})")
    return None


async def acompact_result(source, result, **options):
    return await asyncio.to_thread(compact_result, source, result, **options)
