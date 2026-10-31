# Ante integration

```bash
tokenjuice install ante
tokenjuice doctor ante
tokenjuice uninstall ante
```

The installer adds a marker-delimited instruction block telling Antigma Ante to
use `tokenjuice wrap -- <command>` for noisy terminal output. The raw escape is
`tokenjuice wrap --raw -- <command>`. This is guidance; Ante chooses whether to
follow it and retains command execution and approval decisions.

Starting at the working directory, tokenjuice searches ancestors for the nearest
existing `AGENTS.md`, or `CLAUDE.md` when the same directory has no `AGENTS.md`.
The search can select shared instructions above the Git root. If none
exists, it creates `AGENTS.md` at the Git root, or the working directory outside
Git. Existing fallback instructions remain in their original file. Uninstall
removes only Ante's managed block. Doctor validates that block, not a running
Ante session.

Ante reads instructions when the first user message is submitted. Start a new
session after changing them. Ante also reads global `~/.ante/AGENTS.md`, following
`ANTE_HOME` when set; this project installer does not manage that global file.
The library API accepts an explicit instruction path or `projectDir` option.

Contract: [Ante AGENTS.md and CLAUDE.md fallback](https://docs.antigma.ai/extend/agents-md/).
Live guidance adherence has not yet been qualified.
