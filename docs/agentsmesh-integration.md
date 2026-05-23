# AgentsMesh integration

AgentsMesh support is beta.

After `agentsmesh init`, `tokenjuice install agentsmesh` writes
`.agentsmesh/rules/tokenjuice.md` in the current workspace. AgentsMesh treats
`.agentsmesh/` as the canonical source for rules, commands, agents, skills, MCP,
hooks, permissions, and ignore patterns, then generates native config files for
enabled tools.

## Install

```bash
agentsmesh init
tokenjuice install agentsmesh
agentsmesh generate
tokenjuice doctor agentsmesh
```

## Uninstall

```bash
tokenjuice uninstall agentsmesh
agentsmesh generate
```

## Behavior

- The source rule tells generated native tool configs to prefer `tokenjuice wrap -- <command>` for terminal commands likely to produce long output.
- The source rule tells downstream agents to treat compacted output as authoritative.
- The only documented escape hatch is `tokenjuice wrap --raw -- <command>`.
- Existing `.agentsmesh/rules/tokenjuice.md` content is backed up before install.
- Install refuses to create an AgentsMesh project by itself; initialize the project with `agentsmesh init` first.
- Uninstall removes the source rule; run `agentsmesh generate` afterward so
  native tool configs drop any previously generated tokenjuice guidance.
- If `agentsmesh.yaml` declares a `features` list, it must include `rules`; target overrides without `rules` are reported by doctor because those targets will not receive the generated tokenjuice guidance.

## Current beta caveat

AgentsMesh is a config sync layer, not a command runtime. This integration does
not intercept shell output; it adds a tokenjuice source rule that AgentsMesh can
generate into the native tool configs it manages.
