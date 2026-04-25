# Zed integration

Zed support is beta.

`tokenjuice install zed` inserts a marker-delimited rule block into `.rules` at
the workspace root. Zed includes top-level `.rules` files as project-level Agent
Panel instructions, so this gives the agent stable guidance for using tokenjuice
when it runs terminal commands.

## Install

```bash
tokenjuice install zed
tokenjuice doctor zed
```

## Behavior

- The rule block tells Zed Agent to prefer `tokenjuice wrap -- <command>` for
  terminal commands likely to produce long output.
- The rule block tells Zed Agent to treat compacted output as authoritative.
- The only documented escape hatch is `tokenjuice wrap --raw -- <command>`.
- Existing `.rules` content is backed up before install and preserved around the
  tokenjuice block.

## Current beta caveat

Zed rules are prompt guidance, not command hooks. This integration does not
intercept or rewrite shell output; it gives Zed Agent a stable project rule to
follow when it decides how to run terminal commands.
