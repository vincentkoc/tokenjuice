# Mistral Vibe integration

`tokenjuice install mistral-vibe` inserts a marker-delimited instruction block
into the current git/project root `AGENTS.md`. Mistral Vibe documents
`AGENTS.md` support only for a file at the workspace root, so tokenjuice writes
there instead of trying to manage nested instruction files.

```bash
tokenjuice install mistral-vibe
tokenjuice doctor mistral-vibe
tokenjuice uninstall mistral-vibe
```

By default tokenjuice resolves the nearest git root and writes `AGENTS.md`.
Set `MISTRAL_VIBE_PROJECT_DIR=/path/to/workspace` to target a specific
workspace in scripts or tests.

The installed block tells Mistral Vibe to use:

```bash
tokenjuice wrap -- <command>
```

for noisy terminal commands, and to reserve:

```bash
tokenjuice wrap --raw -- <command>
```

for commands where exact output bytes are required.

This is guidance-only. Mistral Vibe still owns command execution and approval;
tokenjuice does not intercept or rewrite Vibe tool output.

`doctor mistral-vibe` reports `ok` when the root `AGENTS.md` block exists,
contains the `tokenjuice wrap` guidance, and does not advertise the older
`--full` escape hatch. Malformed tokenjuice markers are reported as `broken`
so project instructions are not rewritten unsafely.
