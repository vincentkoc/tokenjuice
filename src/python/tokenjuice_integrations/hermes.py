"""Hermes native terminal transform. The host retains its own status envelope."""
from .bridge import compact_result


def transform_terminal_output(command, output, returncode=None, env_type="", **kwargs):
    # Background poll output has no environment provenance; do not rewrite it.
    if not isinstance(env_type, str) or not env_type:
        return None
    return compact_result("hermes", {"command": command, "output": output, "exitCode": returncode})


def register(ctx):
    ctx.register_hook("transform_terminal_output", transform_terminal_output)
