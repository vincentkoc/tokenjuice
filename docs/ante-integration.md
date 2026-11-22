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

## Native acceptance

After building, run `node scripts/ante-e2e.mjs /path/to/ante`. The pinned native
`0.3.1` fixture uses an isolated `HOME` and `ANTE_HOME`, a credential-free
loopback OpenAI-compatible provider, fresh headless sessions and `auto`
permission mode. No real account or shared server is used.

The fixture verifies native `CLAUDE.md` fallback loading, installed guidance,
`AGENTS.md` shadowing and uninstall restoration. Its deterministic provider
chooses commands from the instructions actually received from Ante. Follow-up
model requests verify an 80-entry listing summary, exact CRLF and blank lines,
raw bypass, and complete exit-7 stdout/stderr with explicit `--keep-failures`.
Native tool events are checked alongside the provider transcript. Reinstall and
uninstall preserve custom instructions. CI verifies the official Linux archive
digest before running the same fixture.

This qualifies instruction discovery and tool transport in the pinned CLI.
Other models' adherence, versions, desktop sessions, remote providers and
permission modes require separate acceptance. Doctor still validates the file,
not the running session.

Native fixture contracts: [headless mode](https://docs.antigma.ai/usage/headless/),
[provider catalog](https://docs.antigma.ai/reference/catalog-reference/) and
[approvals](https://docs.antigma.ai/usage/approvals/).
