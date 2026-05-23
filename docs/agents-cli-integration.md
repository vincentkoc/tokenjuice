# agents-cli integration

agents-cli support is beta.

`tokenjuice install agents-cli` inserts a marker-delimited memory block into
`~/.agents/memory/AGENTS.md`. agents-cli treats `~/.agents/` as its canonical
shared config source and syncs memory into downstream agent harnesses.

## Install

```bash
tokenjuice install agents-cli
agents sync
tokenjuice doctor agents-cli
```

## Behavior

- The memory block tells synced harness configs to prefer `tokenjuice wrap -- <command>` for terminal commands likely to produce long output.
- The memory block tells downstream agents to treat compacted output as authoritative.
- The only documented escape hatch is `tokenjuice wrap --raw -- <command>`.
- Existing `~/.agents/memory/AGENTS.md` content is backed up before install and preserved around the tokenjuice block.
- After editing, installing, or uninstalling the memory block, run `agents sync` so downstream harness configs receive the updated guidance.

## Current beta caveat

agents-cli is a shared config sync layer, not a command runtime. This
integration does not intercept shell output; it adds tokenjuice memory that
agents-cli can sync into the native instruction/config surfaces for supported
agents.

For testing and managed environments, set `AGENTS_CLI_HOME` to point tokenjuice
at an alternate agents-cli config directory.
