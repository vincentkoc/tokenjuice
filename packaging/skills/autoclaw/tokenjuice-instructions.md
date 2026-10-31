# tokenjuice terminal output compaction

Use this workflow when a task needs terminal commands with long output.

1. Confirm that the current AutoClaw agent has a command-execution tool. If it
   does not, report that this workflow cannot run in the selected environment.
2. Inside that tool's execution environment, check `tokenjuice --version`. In
   Bash also check `command -v tokenjuice`. If unavailable, report the missing
   dependency; do not assume the desktop installation is visible remotely.
3. Run noisy commands through `tokenjuice wrap -- <command>`. Keep the requested
   operation, working directory and approval requirements intact.
4. Treat compacted output as authoritative unless it asks for raw output. When
   exact bytes are required, use `tokenjuice wrap --raw -- <command>`.
5. Inspect exit status and stderr, report failures accurately and summarize the
   useful output. This workflow guides commands; it does not intercept other tools.
