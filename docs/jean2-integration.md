# Jean2 integration

Jean2 support is beta.

`tokenjuice install jean2` inserts a marker-delimited instruction block into
the current workspace `AGENTS.md`. Jean2 documents `{workspace}/AGENTS.md`
as always-on project instructions, so tokenjuice uses that project instruction
surface instead of claiming command-output interception.

```bash
tokenjuice install jean2
tokenjuice doctor jean2
tokenjuice uninstall jean2
```

By default, tokenjuice writes `AGENTS.md` in the nearest git root, falling back
to the current working directory when no git root exists. Set
`JEAN2_PROJECT_DIR=/path/to/workspace` to target a workspace explicitly from
scripts.

The installed block tells Jean2 to use `tokenjuice wrap -- <command>` for
terminal commands likely to produce long output, and to use
`tokenjuice wrap --raw -- <command>` only when raw bytes are required.

Existing `AGENTS.md` content is backed up before install and preserved outside
the managed tokenjuice block. Uninstall removes only the tokenjuice block.

`doctor jean2` reports `ok` when the `AGENTS.md` block exists, includes
tokenjuice wrap guidance, includes the raw escape hatch, and does not suggest
the full-output escape hatch.

This integration is guidance-only. Jean2 can read project instructions, but
those instructions do not replace terminal command output.
