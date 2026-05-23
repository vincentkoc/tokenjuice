# Open WebUI integration

Open WebUI support is beta.

`tokenjuice install openwebui` writes
`.openwebui/tools/tokenjuice_compact.py` in the current workspace. This is a
Workspace Tool source file that you review and import manually in Open WebUI.

Open WebUI Workspace Tools execute Python on the server, so tokenjuice does not
auto-import into an Open WebUI instance, modify its database, or enable the tool
globally.

## Install

```bash
tokenjuice install openwebui
tokenjuice doctor openwebui
```

Then import the generated Python file through Open WebUI's Workspace Tool flow.
Review the source before saving it, and restrict Workspace access to trusted
administrators.

## Behavior

- The tool exposes `compact_terminal_output(command, output, exit_code)`.
- The `command` argument is metadata for tokenjuice rule matching. It is not
  executed.
- The `output` argument is the terminal output text to compact.
- The tool invokes `tokenjuice reduce-json` with a fixed argv list; it does not
  use `shell=True`, and the subprocess call is offloaded from Open WebUI's async
  event loop.
- Admin valves configure the `tokenjuice` executable path, timeout, maximum
  input size, and maximum returned text size.
- `tokenjuice doctor openwebui` treats edited tool source as broken, and
  `tokenjuice uninstall openwebui` refuses to delete edited or replaced source
  files. Reinstall first if you want tokenjuice to replace a local edit with a
  backup.

## Current beta caveat

This is not a shell hook. It does not intercept Open WebUI's Open Terminal,
MCP, OpenAPI tools, or arbitrary Workspace Tools. It is a safe reviewable bridge
for compacting terminal output that is already present in a chat or workflow.

For command-running workflows, keep command execution outside this tool and pass
only captured output into `compact_terminal_output`.
