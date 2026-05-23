# dot-agents integration

dot-agents support is beta.

`tokenjuice install dot-agents` inserts a marker-delimited block into the global
dot-agents rules file at
`~/.agents/rules/global/rules.mdc`. dot-agents treats `~/.agents/` as the
unified config home and propagates global rules to the agent configs it manages.

## Install

```bash
tokenjuice install dot-agents
dot-agents sync
tokenjuice doctor dot-agents
```

## Behavior

- The global rules block tells managed coding-agent configs to prefer `tokenjuice wrap -- <command>` for terminal commands likely to produce long output.
- The global rules block tells downstream agents to treat compacted output as authoritative.
- The only documented escape hatch is `tokenjuice wrap --raw -- <command>`.
- Fresh installs create the documented `alwaysApply: true` frontmatter for dot-agents global rules.
- Existing `~/.agents/rules/global/rules.mdc` content is backed up and preserved around the tokenjuice block.
- Run `dot-agents sync` after install or uninstall so managed agent configs receive the updated guidance.

## Current beta caveat

dot-agents is a config propagation layer, not a command runtime. This
integration does not intercept shell output; it adds one global rules block that
dot-agents can distribute to supported AI coding agents.

For testing and managed environments, set `DOT_AGENTS_HOME` to point tokenjuice
at an alternate dot-agents config directory.
