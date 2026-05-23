# GitHub Copilot Coding Agent Integration

`tokenjuice install copilot-agent` writes a repository-level Copilot hook to
`.github/hooks/tokenjuice-agent.json`.

The hook runs on `postToolUse` events and compacts successful `bash` tool
results. It runs:

```bash
tokenjuice copilot-agent-post-tool-use
```

When Copilot returns noisy successful shell output, tokenjuice replaces the
tool result with compacted output. Failed, denied, non-bash, malformed, and
explicit `tokenjuice wrap --raw -- ...` invocations pass through unchanged.

## Cloud Agent Caveat

GitHub Copilot cloud agent loads hook configuration from `.github/hooks/*.json`
inside the cloned repository. The cloud sandbox is ephemeral and only honors
`bash` or `command` entries, so this integration writes both fields.

The hook command still needs `tokenjuice` to be available in `PATH` before the
hook runs. For repositories using Copilot cloud agent, install tokenjuice as
part of the agent environment setup or use a project-local binary that the
hook command can resolve.

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
