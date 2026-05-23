# IBM Bob integration

IBM Bob support is beta.

`tokenjuice install bob` inserts a marker-delimited instruction block into
`AGENTS.md` at the current git/project root. IBM Bob Shell loads `AGENTS.md`
context files hierarchically, including global `~/.bob/AGENTS.md`, project-root
and parent-directory `AGENTS.md`, and subdirectory `AGENTS.md` files for local
component instructions.

```bash
tokenjuice install bob
tokenjuice doctor bob
tokenjuice uninstall bob
```

By default tokenjuice resolves the nearest git root and writes `AGENTS.md`.
Set `BOB_PROJECT_DIR=/path/to/repo` to target a specific repository in
scripts or tests.

The installed block tells IBM Bob to use:

```bash
tokenjuice wrap -- <command>
```

for noisy terminal commands, and to reserve:

```bash
tokenjuice wrap --raw -- <command>
```

for commands where exact output bytes are required.

This is guidance-only. IBM Bob still owns command execution, permissions,
and prompt loading; tokenjuice does not intercept or rewrite IBM Bob tool output.

`doctor bob` reports `ok` when the root `AGENTS.md` block exists, contains the
`tokenjuice wrap` guidance, and does not advertise the older `--full` escape
hatch. Malformed tokenjuice markers are reported as `broken` so project memory
is not rewritten unsafely.
