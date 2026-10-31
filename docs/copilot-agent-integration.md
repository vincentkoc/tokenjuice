# GitHub Copilot Coding Agent Integration

`tokenjuice install copilot-agent` writes a repository-level Copilot hook to
`.github/hooks/tokenjuice-agent.json`.

The hook runs on `postToolUse` events and compacts successful `bash` tool
results with a proven successful shell completion. It runs:

```bash
tokenjuice copilot-agent-post-tool-use
```

When Copilot returns noisy successful shell output, tokenjuice replaces the
tool result with compacted output only when `resultType` is `success` and the
native completion footer proves shell exit 0. Copilot's successful invocation
flag alone does not establish shell success: the local native runtime reports it
for exit 7 too. The shared compactor removes the footer before summarizing and
reappends it unchanged. Failed, denied, running, missing-status, non-bash,
malformed and explicit raw/full invocations pass through unchanged.

The CLI and repository adapters share this result compactor. Canonical camelCase
and VS Code-compatible snake_case envelopes are supported, including JSON-string
tool arguments. Undocumented `toolInput` aliases and serialized result envelopes
are not used. Unknown shell-result formats remain raw.

## Cloud Agent Caveat

GitHub Copilot cloud agent loads hook configuration from `.github/hooks/*.json`
inside the cloned repository. The cloud sandbox is ephemeral and only honors
`bash` or `command` entries, so this integration writes both fields.

The hook command still needs `tokenjuice` to be available in `PATH` before the
hook runs. For repositories using Copilot cloud agent, install tokenjuice as
part of the agent environment setup or use a project-local binary that the
hook command can resolve.

## Verification scope

`scripts/copilot-cli-e2e.mjs <pinned-copilot-binary> copilot-agent` installs the
real repository hook in a disposable Git repository and runs native Copilot CLI
1.0.105 against a loopback provider. The disposable repository uses one-session
`--trust-folder`; an untrusted control confirms the hook is skipped. Baseline
and installed sessions inspect actual hook receipts, CLI completion events and
follow-up model requests. They check
an 80-file summary, native whitespace-normalized reads, explicit wrapping/raw
bypass, and complete exit-7 stdout/stderr with its original completion footer.
Linux CI reuses the pinned CLI binary; macOS arm64 is checked locally.

This validates the repository hook through the local CLI. It does not qualify a
Copilot cloud job. Cloud acceptance still requires this configuration on the
repository's default branch, tokenjuice in the job environment, and inspection
of that job's actual hook/result delivery. Other versions and remote providers
also need separate acceptance.

References: [shared hook contract](https://docs.github.com/en/copilot/reference/hooks-reference)
and [cloud discovery requirements](https://docs.github.com/en/copilot/how-tos/copilot-on-github/customize-copilot/customize-cloud-agent/use-hooks).

## Commands

```bash
tokenjuice install copilot-agent
tokenjuice doctor copilot-agent
tokenjuice uninstall copilot-agent
```

Use `--local` when validating a checkout build:

```bash
tokenjuice install copilot-agent --local
tokenjuice doctor copilot-agent --local
```
