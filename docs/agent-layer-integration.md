# Agent Layer integration

Agent Layer support is beta.

After `al init`, `tokenjuice install agent-layer` writes
`.agent-layer/instructions/tokenjuice.md` in the current workspace. Agent Layer
treats `.agent-layer/` as the source of truth and syncs instructions into
generated client config files.

## Install

```bash
al init
tokenjuice install agent-layer
al sync
tokenjuice doctor agent-layer
```

## Uninstall

```bash
tokenjuice uninstall agent-layer
al sync
```

## Behavior

- The source instructions tell synced client configs to prefer `tokenjuice wrap -- <command>` for terminal commands likely to produce long output.
- The source instructions tell downstream agents to treat compacted output as authoritative.
- The only documented escape hatch is `tokenjuice wrap --raw -- <command>`.
- Existing `.agent-layer/instructions/tokenjuice.md` content is backed up before install.
- Install refuses to create `.agent-layer/` by itself; initialize the Agent Layer project with `al init` first.
- Uninstall removes the source instructions; run `al sync` afterward so generated
  client files drop any previously synced tokenjuice guidance.

## Current beta caveat

Agent Layer is a config sync layer, not a command runtime. This integration does
not intercept shell output; it adds tokenjuice source instructions that Agent
Layer can sync to generated client files.
