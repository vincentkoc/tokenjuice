# Tabnine integration

Tabnine support is beta.

`tokenjuice install tabnine` inserts a marker-delimited instruction block into
`TABNINE.md` at the current git/project root. Tabnine CLI documents
`TABNINE.md` as a persistent, hierarchical context file for always-on project
knowledge.

```bash
tokenjuice install tabnine
tokenjuice doctor tabnine
tokenjuice uninstall tabnine
```

By default tokenjuice resolves the nearest git root and writes `TABNINE.md`.
Set `TABNINE_PROJECT_DIR=/path/to/repo` to target a specific repository in
scripts or tests.

The installed block tells Tabnine to use:

```bash
tokenjuice wrap -- <command>
```

for noisy terminal commands, and to reserve:

```bash
tokenjuice wrap --raw -- <command>
```

for commands where exact output bytes are required.

This is guidance-only. Tabnine CLI still owns command execution, permissions,
and prompt loading; tokenjuice does not intercept or rewrite Tabnine CLI tool output.

`doctor tabnine` reports `ok` when the root `TABNINE.md` block exists, contains the
`tokenjuice wrap` guidance, and does not advertise the older `--full` escape
hatch. Malformed tokenjuice markers are reported as `broken` so project context
is not rewritten unsafely.
