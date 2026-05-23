# Amazon Q integration

Amazon Q support is beta and exists for the Amazon Q / Kiro compatibility path.
For new Kiro-only workspaces, prefer `tokenjuice install kiro`.

`tokenjuice install amazon-q` writes `.amazonq/rules/tokenjuice.md` in the
current git/project root. Amazon Q Developer CLI has been rebranded to Kiro, but
Kiro can continue using Amazon Q rules and configuration. This integration gives
that compatibility path terminal-output guidance without claiming a hook-backed
output replacement contract.

## Install

```bash
tokenjuice install amazon-q
tokenjuice doctor amazon-q
tokenjuice uninstall amazon-q
```

Add the workspace rule glob to the active Amazon Q CLI agent configuration:

```json
{
  "resources": ["file://.amazonq/rules/**/*.md"]
}
```

Set `AMAZON_Q_PROJECT_DIR=/path/to/workspace` to override the target project
explicitly.

## Behavior

- The rule tells Amazon Q Developer CLI to prefer `tokenjuice wrap -- <command>`
  for terminal commands likely to produce long output.
- The rule tells Amazon Q to treat compacted output as authoritative.
- The only documented escape hatch is `tokenjuice wrap --raw -- <command>`.
- Existing `.amazonq/rules/tokenjuice.md` content is backed up before install.

## Current beta caveat

Amazon Q CLI documents agent hooks, including `preToolUse` and `postToolUse`,
but the available docs do not establish that those hooks can replace terminal
command output after execution. This integration is therefore rule-based. A
future hook-backed adapter should only be added when that output-replacement
contract is verified against Amazon Q CLI itself.
