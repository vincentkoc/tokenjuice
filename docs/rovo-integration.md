# Rovo integration

Rovo support is beta.

`tokenjuice install rovo` inserts a marker-delimited instruction block into
`AGENTS.md` at the current git/project root. Atlassian documents that Rovo Dev
CLI stores project memory in `AGENTS.md` and `AGENTS.local.md` in workspace
directories, while user memory lives separately in `~/.rovodev/AGENTS.md`.

```bash
tokenjuice install rovo
tokenjuice doctor rovo
tokenjuice uninstall rovo
```

By default tokenjuice resolves the nearest git root and writes `AGENTS.md`.
Set `ROVO_DEV_PROJECT_DIR=/path/to/repo` to target a specific repository in
scripts or tests.

The installed block tells Rovo Dev CLI to use:

```bash
tokenjuice wrap -- <command>
```

for noisy terminal commands, and to reserve:

```bash
tokenjuice wrap --raw -- <command>
```

for commands where exact output bytes are required.

This is guidance-only. Rovo Dev CLI still owns command execution, permissions,
and memory loading; tokenjuice does not intercept or rewrite Rovo Dev tool
output.

`doctor rovo` reports `ok` when the root `AGENTS.md` block exists, contains the
`tokenjuice wrap` guidance, and does not advertise the older `--full` escape
hatch. Malformed tokenjuice markers are reported as `broken` so project memory
is not rewritten unsafely.
