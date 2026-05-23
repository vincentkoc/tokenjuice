# Deep Agents Code integration

Deep Agents Code support is beta.

`tokenjuice install deepagents` inserts a marker-delimited instruction block
into `.deepagents/AGENTS.md` at the current git/project root. Deep Agents Code
loads project instructions from that file, so the preferred Deep Agents-specific
path keeps the tokenjuice guidance scoped to Deep Agents without editing
repo-wide agent instruction files.

## Install

```bash
tokenjuice install deepagents
tokenjuice doctor deepagents
```

## Behavior

- The instruction block tells Deep Agents Code to prefer `tokenjuice wrap -- <command>` for terminal commands likely to produce long output.
- The instruction block tells Deep Agents Code to treat compacted output as authoritative.
- The only documented escape hatch is `tokenjuice wrap --raw -- <command>`.
- Existing `.deepagents/AGENTS.md` content is backed up before install and preserved around the tokenjuice block.

## Current beta caveat

Deep Agents Code project instructions are prompt guidance, not command hooks.
This integration does not intercept shell output; it gives Deep Agents Code a
stable project instruction to follow when it decides how to run terminal
commands.
