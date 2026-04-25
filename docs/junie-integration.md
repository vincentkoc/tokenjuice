# Junie integration

Junie support is beta.

`tokenjuice install junie` inserts a marker-delimited instruction block into
`.junie/AGENTS.md`. Junie CLI reads persistent project instructions from that
file, so this gives the agent stable guidance for using tokenjuice when it runs
terminal commands.

## Install

```bash
tokenjuice install junie
tokenjuice doctor junie
```

## Behavior

- The instruction block tells Junie to prefer `tokenjuice wrap -- <command>` for
  terminal commands likely to produce long output.
- The instruction block tells Junie to treat compacted output as authoritative.
- The only documented escape hatch is `tokenjuice wrap --raw -- <command>`.
- Existing `.junie/AGENTS.md` content is backed up before install and preserved
  around the tokenjuice block.

## Current beta caveat

Junie project instructions are prompt guidance, not command hooks. This
integration does not intercept or rewrite shell output; it gives Junie a stable
project instruction to follow when it decides how to run terminal commands.
