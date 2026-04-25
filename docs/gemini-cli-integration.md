# Gemini CLI integration

Gemini CLI support is beta.

`tokenjuice install gemini-cli` writes an `AfterTool` hook into
`~/.gemini/settings.json` for the `run_shell_command` tool. When Gemini CLI
returns noisy shell output, tokenjuice compacts it and replaces the tool result
with the compacted version plus the raw-output escape hatch:

```bash
tokenjuice wrap --raw -- <command>
```

## Install

```bash
tokenjuice install gemini-cli
tokenjuice doctor gemini-cli
```

For repo-local verification during development:

```bash
pnpm build
node dist/cli/main.js install gemini-cli --local
node dist/cli/main.js doctor gemini-cli --local
```

## Behavior

- Only `AfterTool` payloads for `run_shell_command` are considered.
- Empty output and low-savings reductions are left untouched.
- Safe repository inventory commands can still be compacted.
- Exact file-content inspection commands stay raw unless tokenjuice can build a
  safe summary.

## Current beta caveat

The hook uses Gemini CLI's `decision: "deny"` result-replacement path for
`AfterTool` hooks. That is the right fit for keeping duplicate raw output out of
the model context, but it should be smoke-tested against live Gemini CLI releases
as their hook API evolves.
