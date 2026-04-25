# Continue integration

Continue support is beta.

`tokenjuice install continue` writes a workspace rule to
`.continue/rules/tokenjuice.md`. Continue automatically loads local workspace
rules in Agent, Chat, and Edit modes, so this gives the agent stable guidance for
using tokenjuice when it chooses to run terminal commands.

## Install

```bash
tokenjuice install continue
tokenjuice doctor continue
```

## Behavior

- The rule tells Continue to prefer `tokenjuice wrap -- <command>` for terminal
  commands likely to produce long output.
- The rule tells Continue to treat compacted output as authoritative.
- The only documented escape hatch is `tokenjuice wrap --raw -- <command>`.
- Existing `.continue/rules/tokenjuice.md` content is backed up before install.

## Current beta caveat

Continue rules are model instructions, not command hooks. This integration does
not intercept or rewrite tool output; it nudges Continue toward tokenjuice's
wrapper when the agent is deciding how to run shell commands.
