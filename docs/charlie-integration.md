# Charlie integration

Charlie support is beta.

`tokenjuice install charlie` inserts a marker-delimited instruction block into
the current git/project root `AGENTS.md`. Charlie documents `AGENTS.md` as the
durable repo-instruction surface that it loads by default, so tokenjuice uses
that surface instead of claiming command-output interception.

```bash
tokenjuice install charlie
tokenjuice doctor charlie
tokenjuice uninstall charlie
```

By default, tokenjuice resolves the nearest git root before writing
`AGENTS.md`. Set `CHARLIE_PROJECT_DIR=/path/to/workspace` to override the
target workspace explicitly.

The installed block tells Charlie to use `tokenjuice wrap -- <command>` for
terminal commands likely to produce long output, and to use
`tokenjuice wrap --raw -- <command>` only when raw bytes are required.

Existing `AGENTS.md` content is backed up before install and preserved outside
the managed tokenjuice block. Uninstall removes only the tokenjuice block.

`doctor charlie` reports `ok` when the `AGENTS.md` block exists, includes
tokenjuice wrap guidance, includes the raw escape hatch, and does not suggest
the full-output escape hatch.

This integration is guidance-only. Charlie can read project instructions, but
those instructions do not replace terminal command output.
