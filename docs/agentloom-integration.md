# Agentloom integration

Agentloom support is beta.

`tokenjuice install agentloom` writes `.agents/rules/tokenjuice-agentloom.md`
in the current workspace. Agentloom treats `.agents/` as the canonical source
for agents, commands, rules, skills, and MCP definitions, then syncs those
definitions into provider-native config files.

## Install

```bash
tokenjuice install agentloom
agentloom sync
tokenjuice doctor agentloom
```

## Uninstall

```bash
tokenjuice uninstall agentloom
agentloom sync
```

## Behavior

- The source rule tells synced provider-native agent configs to prefer
  `tokenjuice wrap -- <command>` for terminal commands likely to produce long
  output.
- The source rule tells downstream agents to treat compacted output as
  authoritative.
- The only documented escape hatch is `tokenjuice wrap --raw -- <command>`.
- Existing `.agents/rules/tokenjuice-agentloom.md` content is backed up before
  install.
- Uninstall removes the source rule; run `agentloom sync` afterward so
  provider-native configs drop any previously synced tokenjuice guidance.
- The file name is host-specific so it can coexist with other `.agents/rules/`
  integrations.

## Current beta caveat

Agentloom is a config sync layer, not a command runtime. This integration does
not intercept shell output; it adds a tokenjuice source rule that Agentloom can
sync to the provider configs it manages.
