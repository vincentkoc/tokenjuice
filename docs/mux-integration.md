# Mux integration

Mux support is beta.

`tokenjuice install mux` writes an executable tokenjuice block to the project
hook at `.mux/tool_post`. Mux documents `tool_post` as a post-tool hook that
runs after every tool execution and receives the full tool result path in
`MUX_TOOL_RESULT_PATH`.

```bash
tokenjuice install mux
tokenjuice doctor mux
tokenjuice uninstall mux
```

By default tokenjuice resolves the nearest git root and writes the hook there.
Set `MUX_PROJECT_DIR=/path/to/repo` to target a specific repository in scripts
or tests.

When Mux runs a `bash` tool, the installed hook calls:

```bash
tokenjuice mux-post-tool-use
```

The hook reads Mux's `MUX_TOOL_INPUT_PATH` and `MUX_TOOL_RESULT_PATH`, compacts
noisy shell output through the shared reducer, and prints compacted context as
hook output when compaction is useful.

This does not suppress the original tool result. Mux still owns tool execution
and hook rendering; tokenjuice adds compacted context alongside the original
output.

If `.mux/tool_post` already exists, tokenjuice backs it up, preserves the
existing hook body, and removes only the tokenjuice block during uninstall.
Existing hook files must be bash scripts so tokenjuice can safely add its
managed block without changing the hook interpreter.

`doctor mux` reports `ok` when `.mux/tool_post` is executable and points at the
expected `mux-post-tool-use` command.
