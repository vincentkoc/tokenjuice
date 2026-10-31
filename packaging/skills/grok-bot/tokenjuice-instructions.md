# tokenjuice terminal workflow

Use this skill for noisy terminal output on the Bot's cloud computer.

1. Check `command -v tokenjuice` and `tokenjuice --version` on that computer.
   A local desktop installation does not establish cloud availability. Report a
   missing dependency before attempting to wrap commands.
2. Run noisy commands through `tokenjuice wrap -- <command>` while preserving
   the requested operation, working directory and approval requirements.
3. Treat compacted output as authoritative unless it explicitly requests raw
   output. For exact bytes, use `tokenjuice wrap --raw -- <command>`.
4. Check exit status and stderr and report failures accurately. Summarize useful
   output without claiming interception of commands run without the wrapper.

Invoke this skill by name. It provides instructions and does not grant command
permissions or establish automatic loading of local workspace rule files.
