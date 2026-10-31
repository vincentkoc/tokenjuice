---
name: tokenjuice
description: "Compact noisy terminal output with tokenjuice while preserving exact-read and failure semantics."
---

# tokenjuice terminal output compaction

Use this skill when a task requires terminal commands with long output.

1. Check `tokenjuice --version` inside the actual command execution environment.
   In Bash, also run `command -v tokenjuice`. If it is missing, report that
   dependency; a desktop installation does not prove availability in a sandbox.
2. Run noisy terminal commands through `tokenjuice wrap -- <command>`.
3. Treat compacted output as authoritative unless it explicitly requests raw
   output. Use `tokenjuice wrap --raw -- <command>` when exact bytes are needed.
4. Preserve the requested operation, approval requirements and working directory.
   Inspect the command's exit status and stderr; report failures accurately.
5. Summarize the useful command result without claiming interception of commands
   that were executed without the wrapper.

Doubao Work retains tool selection, execution and approval decisions. This skill
provides guidance; it does not install a hook or change those decisions.
