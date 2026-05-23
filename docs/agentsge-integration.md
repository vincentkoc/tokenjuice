# agents.ge integration

agents.ge support is beta.

`tokenjuice install agentsge` writes `.agents/rules/tokenjuice-agentsge.md`
in the current workspace. agents.ge treats `.agents/` as the project memory
source of truth and syncs rules into generated agent entrypoints.

## Install

```bash
tokenjuice install agentsge
agents sync
tokenjuice doctor agentsge
```

## Behavior

- The source rule tells synced coding-agent entrypoints to prefer
  `tokenjuice wrap -- <command>` for terminal commands likely to produce long
  output.
- The source rule tells downstream agents to treat compacted output as
  authoritative.
- The only documented escape hatch is `tokenjuice wrap --raw -- <command>`.
- Existing `.agents/rules/tokenjuice-agentsge.md` content is backed up before
  install.
- The file name is host-specific so it can coexist with other `.agents/rules/`
  integrations.

## Current beta caveat

agents.ge is a project-memory and sync layer, not a command runtime. This
integration does not intercept shell output; it adds a tokenjuice source rule
that agents.ge can propagate to the agent entrypoints it manages.
