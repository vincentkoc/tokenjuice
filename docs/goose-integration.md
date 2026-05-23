# Goose integration

Goose support is beta.

`tokenjuice install goose` inserts a marker-delimited hints block into
`.goosehints` at the workspace root. Goose loads `.goosehints` as project
context, so this gives the agent stable guidance for using tokenjuice when it
runs terminal commands.

## Install

```bash
tokenjuice install goose
tokenjuice doctor goose
```

Restart the Goose session after installing or changing `.goosehints` so Goose
loads the updated hints.

## Behavior

- The hints block tells Goose to prefer `tokenjuice wrap -- <command>` for
  terminal commands likely to produce long output.
- The hints block tells Goose to treat compacted output as authoritative.
- The only documented escape hatch is `tokenjuice wrap --raw -- <command>`.
- Existing `.goosehints` content is backed up before install and preserved
  around the tokenjuice block.

## Current beta caveat

Goose hints are prompt guidance, not command hooks. Goose has lifecycle hooks,
but this integration does not rely on them because the documented hooks surface
does not guarantee shell output replacement. It gives Goose a stable project
hint to follow when it decides how to run terminal commands.
