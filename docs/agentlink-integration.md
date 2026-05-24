# Agentlink integration

Agentlink support is beta.

`tokenjuice install agentlink` inserts a marker-delimited instruction block into
the current git/project root `AGENTS.md`. Agentlink uses one source instruction
file and symlinks downstream tool instruction files to it, so tokenjuice writes
to that source instead of trying to manage each generated link.

```bash
tokenjuice install agentlink
tokenjuice doctor agentlink
tokenjuice uninstall agentlink
```

By default, tokenjuice resolves the nearest git root before writing
`AGENTS.md`. Set `AGENTLINK_PROJECT_DIR=/path/to/workspace` to override the
target workspace explicitly.

The installed block tells agents that receive Agentlink-synced instructions to
use `tokenjuice wrap -- <command>` for terminal commands likely to produce long
output, and to use `tokenjuice wrap --raw -- <command>` only when raw bytes are
required. Run `agentlink sync` after install or uninstall so Agentlink creates,
repairs, or refreshes the downstream symlinks.

Existing `AGENTS.md` content is backed up before install and preserved outside
the managed tokenjuice block. Uninstall removes only the tokenjuice block.

`doctor agentlink` reports `ok` when the `AGENTS.md` block exists, includes
tokenjuice wrap guidance, includes the raw escape hatch, includes Agentlink sync
guidance, and does not suggest the full-output escape hatch.

This integration is guidance-only. Agentlink handles instruction-file links; it
does not intercept or replace terminal command output for the downstream tools.
