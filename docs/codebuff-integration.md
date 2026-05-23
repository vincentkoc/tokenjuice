# Codebuff integration

Codebuff support is beta.

`tokenjuice install codebuff` inserts a marker-delimited instruction block into
`AGENTS.md` at the current git/project root. Codebuff's `/init` flow sets up
project-specific files, and Codebuff documents that it reads existing
`AGENTS.md` and `CLAUDE.md` files.

```bash
tokenjuice install codebuff
tokenjuice doctor codebuff
tokenjuice uninstall codebuff
```

By default tokenjuice resolves the nearest git root and writes `AGENTS.md`.
Set `CODEBUFF_PROJECT_DIR=/path/to/repo` to target a specific repository in
scripts or tests.

The installed block tells Codebuff to use:

```bash
tokenjuice wrap -- <command>
```

for noisy terminal commands, and to reserve:

```bash
tokenjuice wrap --raw -- <command>
```

for commands where exact output bytes are required.

This is guidance-only. Codebuff still owns command execution, permissions,
and prompt loading; tokenjuice does not intercept or rewrite Codebuff tool output.

`doctor codebuff` reports `ok` when the root `AGENTS.md` block exists, contains the
`tokenjuice wrap` guidance, and does not advertise the older `--full` escape
hatch. Malformed tokenjuice markers are reported as `broken` so project memory
is not rewritten unsafely.
