---
name: tokenjuice
description: "Compact noisy terminal output with tokenjuice while preserving exact reads and failed commands."
metadata:
  version: "1.0.0"
  requires:
    bins: [tokenjuice]
---

# tokenjuice terminal output compaction

Use this skill when running terminal commands likely to produce long output.

1. Check `tokenjuice --version` inside QwenPaw's actual command execution
   environment. In a POSIX shell, also run `command -v tokenjuice`. If unavailable,
   report the missing dependency. A desktop installation does not establish
   availability inside a container, VM or remote shell.
2. Run noisy commands through `tokenjuice wrap --keep-failures -- <command>`.
   Keep the requested command, arguments, working directory and approval
   requirements unchanged. Wrapping does not grant permission to execute it.
3. Treat compacted tokenjuice output as authoritative unless it explicitly says
   raw output is required. For exact bytes, use
   `tokenjuice wrap --raw -- <command>`. Do not suggest a second full-output mode.
4. Check the wrapped command's exit status and stderr. `--keep-failures` keeps
   failed-command output unreduced within the capture limit; never report a
   failed command as successful.

This skill guides command selection. It does not intercept tools, replace output
from unwrapped commands, or change QwenPaw's tool permissions.
