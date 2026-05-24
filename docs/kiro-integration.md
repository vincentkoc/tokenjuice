# Kiro integration

Kiro support is beta.

`tokenjuice install kiro` writes an always-included steering file to
`.kiro/steering/tokenjuice.md` in the current workspace. Kiro loads steering
files from `.kiro/steering/`, so this gives Kiro IDE, CLI, and Web stable
guidance for using tokenjuice when they run terminal commands.

## Install

```bash
tokenjuice install kiro
tokenjuice doctor kiro
```

## Behavior

- The steering file tells Kiro to prefer `tokenjuice wrap -- <command>` for
  noisy terminal commands.
- The steering file tells Kiro to treat compacted output as authoritative.
- The only documented escape hatch is `tokenjuice wrap --raw -- <command>`.
- Existing `.kiro/steering/tokenjuice.md` content is backed up before install.
- `KIRO_PROJECT_DIR` can override the workspace root for tests and scripted
  installs.

## Current beta caveat

Kiro steering files are prompt guidance, not command hooks. Kiro CLI hooks can
observe tool calls and block pre-tool usage, but their documented post-tool
behavior does not replace the tool output returned to the agent.
