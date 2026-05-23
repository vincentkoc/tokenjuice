# Warp integration

`tokenjuice install warp` inserts a marker-delimited instruction block into
Warp's project rules file. New projects use the current git/project root
`AGENTS.md`. If `WARP.md` already exists in that root, tokenjuice writes there
because Warp gives `WARP.md` priority over `AGENTS.md` in the same directory.
If tokenjuice already manages a Warp block in `AGENTS.md`, later creating
`WARP.md` does not move that install automatically; `install`, `doctor`, and
`uninstall` keep targeting the existing tokenjuice block.

```bash
tokenjuice install warp
tokenjuice doctor warp
tokenjuice uninstall warp
```

By default tokenjuice resolves the nearest git root. Fresh installs write
`WARP.md` when it already exists, otherwise `AGENTS.md`. Existing tokenjuice
Warp blocks are managed in place, so remove and reinstall explicitly if you want
to move an older `AGENTS.md` install into `WARP.md`. Set
`WARP_PROJECT_DIR=/path/to/workspace` to target a specific workspace in scripts
or tests.

The installed block tells Warp to use:

```bash
tokenjuice wrap -- <command>
```

for noisy terminal commands, and to reserve:

```bash
tokenjuice wrap --raw -- <command>
```

for commands where exact output bytes are required.

This is guidance-only. Warp still owns command execution and approval;
tokenjuice does not intercept or rewrite Warp tool output.

`doctor warp` reports `ok` when the selected project rules file contains the
tokenjuice block, includes `tokenjuice wrap` guidance, and does not advertise
the older `--full` escape hatch. Malformed tokenjuice markers are reported as
`broken` so project instructions are not rewritten unsafely.
