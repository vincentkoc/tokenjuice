# Jules integration

`tokenjuice install jules` inserts a marker-delimited instruction block into
`AGENTS.md` at the current git/project root. Jules documents that it
automatically looks for root `AGENTS.md` and uses it to better understand the
repository and generate more relevant plans and completions.

```bash
tokenjuice install jules
tokenjuice doctor jules
tokenjuice uninstall jules
```

By default tokenjuice resolves the nearest git root and writes `AGENTS.md`.
Set `JULES_PROJECT_DIR=/path/to/repo` to target a specific repository in
scripts or tests.

The installed block tells Jules to use:

```bash
tokenjuice wrap -- <command>
```

for noisy terminal commands, and to reserve:

```bash
tokenjuice wrap --raw -- <command>
```

for commands where exact output bytes are required.

This is guidance-only. Jules still owns command execution, planning, and remote
VM behavior; tokenjuice does not intercept or rewrite Jules tool output.

`doctor jules` reports `ok` when the root `AGENTS.md` block exists, contains
the `tokenjuice wrap` guidance, and does not advertise the older `--full`
escape hatch. Malformed tokenjuice markers are reported as `broken` so project
instructions are not rewritten unsafely.
