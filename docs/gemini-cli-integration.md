# Gemini CLI integration

Gemini CLI support is beta. Native session acceptance pins Gemini CLI 0.66.0.

`tokenjuice install gemini-cli` writes a user-level `BeforeTool` hook for
`run_shell_command`. It routes shell commands through the shared `tokenjuice wrap`
launcher before execution. Gemini CLI retains its permission policy and builds
the native result envelope from the wrapper's output and exit status.

## Install

```bash
tokenjuice install gemini-cli
tokenjuice doctor gemini-cli
tokenjuice uninstall gemini-cli
```

Reinstall after upgrading from the old `AfterTool` integration. Its replacement
path marked compacted results as execution errors and counted host envelope lines
as command output. Reinstall removes tokenjuice's legacy entries while preserving
unrelated hooks and settings. Doctor flags legacy or disabled installations.

## Configuration

- By default, the hook is installed in `~/.gemini/settings.json`.
- Native `GEMINI_CLI_HOME` specifies a home root; settings live inside its
  `.gemini` directory. It takes precedence over tokenjuice's legacy `GEMINI_HOME`
  override, which points directly at a settings directory.
- Enable hooks and trust the workspace in Gemini CLI. `hooksConfig.enabled: false`
  or `hooksConfig.disabled: ["tokenjuice"]` prevents execution.
- The wrapper uses Bash to match Gemini CLI, regardless of the login `SHELL`.
  `TOKENJUICE_GEMINI_CLI_SHELL` provides an explicit interpreter override; choose
  a Bash-compatible shell. Invalid payloads or missing shells leave input unchanged.
- Native Windows wrapping requires WSL; run both tokenjuice and Gemini CLI there.
- Explicit wrappers, including `tokenjuice wrap --raw -- <command>`, are left
  unchanged. Other tool input fields are preserved; the hook grants no permission.

## Native session verification

```bash
pnpm build
node scripts/gemini-e2e.mjs /path/to/gemini
```

The real host runs baseline and installed sessions against a loopback Gemini API
fixture with disposable home, configuration root, and workspace. It executes a
noisy listing, an exact file read, Bash array syntax, a raw bypass, and a failing
command with a non-shell login `SHELL` value. Assertions
inspect subsequent model requests and native stream events. The fixture trusts
only its disposable workspace and allows the shell tool through native CLI
options. No real model credentials are passed through.

Gemini trims edge whitespace and adds a process-group ID to shell results. Exact
reads match the baseline host result; raw comparisons normalize only that volatile
footer ID. The native stream labels shell execution successful even for exit 7,
so the test separately checks model-visible exit status and both output streams.
This verifies native delivery, not remote provider availability or model reasoning.

See the upstream [hook contract](https://geminicli.com/docs/hooks/reference/) and
[configuration reference](https://geminicli.com/docs/reference/configuration/).
