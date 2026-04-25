# Avante.nvim integration

Avante.nvim support is beta.

`tokenjuice install avante` inserts a marker-delimited instruction block into
`avante.md` at the workspace root. Avante uses project-specific instruction files
to shape AI behavior, so this gives the agent stable guidance for using
tokenjuice when it runs terminal commands.

## Install

```bash
tokenjuice install avante
tokenjuice doctor avante
```

## Behavior

- The instruction block tells Avante to prefer `tokenjuice wrap -- <command>` for
  terminal commands likely to produce long output.
- The instruction block tells Avante to treat compacted output as authoritative.
- The only documented escape hatch is `tokenjuice wrap --raw -- <command>`.
- Existing `avante.md` content is backed up before install and preserved around
  the tokenjuice block.

## Current beta caveat

Avante project instructions are prompt guidance, not command hooks. This
integration does not intercept or rewrite shell output; it gives Avante a stable
project instruction to follow when it decides how to run terminal commands.
