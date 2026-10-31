# OpenHands integration

Automatic hook compaction is retired. OpenHands adds `additionalContext` to the
agent prompt; its documented post-tool contract does not replace the original
result. A second summary therefore does not establish token savings.
Use explicit wrapping in the backend terminal instead:

```bash
tokenjuice wrap -- ls -la
tokenjuice wrap --raw -- <command>
```

## Remove a legacy hook

```bash
tokenjuice doctor openhands
tokenjuice uninstall openhands
```

Cleanup selects `.openhands/hooks.json` under `OPENHANDS_PROJECT_DIR`, or the
current directory when that variable is unset. It removes only recognized
tokenjuice commands, preserving other hooks, unknown fields, file modes and
existing backup files. Symlinked project/config paths and concurrent edits are
rejected. Stale runtime handlers return `{}` without injecting context.
`tokenjuice install openhands` fails before creating any files.

OpenHands loads this configuration from the exact conversation working folder
inside its backend; it does not search parent folders. Both snake_case event
keys and the PascalCase/wrapped compatibility format are supported. The old
mapping was valid; additive output is the limitation.

## Verification boundary

Tests cover retirement, scoped cleanup, custom-command preservation, file modes,
symlinks, concurrent edits and silent stale handlers. They do not qualify a native
OpenHands session. Agent Canvas acceptance remains blocked locally by the
unavailable Docker runtime. To qualify it, start an authorized Canvas backend,
make tokenjuice available in that backend, and inspect the next model request
for successful wrapping, exact reads, raw bypass and complete failure output.
The unmaintained V1 CLI and a direct SDK call do not establish Canvas acceptance.

Sources: [OpenHands hook contract](https://docs.openhands.dev/openhands/usage/customization/hooks),
[V1 CLI status](https://github.com/OpenHands/OpenHands-CLI#project-status).
