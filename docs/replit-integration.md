# Replit integration

`tokenjuice install replit` inserts a marker-delimited instruction block into
the current git/project root `replit.md`. Replit documents `replit.md` as a
root-level file that Agent reads automatically for project preferences,
architecture, conventions, and coding style.

```bash
tokenjuice install replit
tokenjuice doctor replit
tokenjuice uninstall replit
```

By default tokenjuice resolves the nearest git root and writes `replit.md`.
Set `REPLIT_PROJECT_DIR=/path/to/workspace` to target a specific workspace in
scripts or tests.

The installed block tells Replit Agent to use:

```bash
tokenjuice wrap -- <command>
```

for noisy terminal commands, and to reserve:

```bash
tokenjuice wrap --raw -- <command>
```

for commands where exact output bytes are required.

This is guidance-only. Replit Agent still owns command execution and approval;
tokenjuice does not intercept or rewrite Agent tool output. Replit also
documents that Agent can update `replit.md` as it learns more about the project,
so rerun `tokenjuice doctor replit` after substantial Agent-authored changes.

`doctor replit` reports `ok` when the root `replit.md` block exists, contains
the `tokenjuice wrap` guidance, and does not advertise the older `--full`
escape hatch. Malformed tokenjuice markers are reported as `broken` so project
instructions are not rewritten unsafely.
