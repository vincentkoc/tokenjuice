---
name: tokenjuice
display_name: "tokenjuice 终端输出压缩"
display_name_en: "tokenjuice terminal output compaction"
description: "Use tokenjuice when terminal commands produce noisy output."
description_zh: "压缩冗长终端输出，保留需要精确读取的原始内容。"
description_en: "Compact noisy terminal output while retaining an exact-output escape hatch."
version: "1.0.0"
author: "tokenjuice maintainers"
---

# tokenjuice terminal output compaction

Use this skill when running terminal commands likely to produce long output.

1. Check `tokenjuice --version` inside the actual Bash tool environment. Also run
   `command -v tokenjuice` there. A desktop installation does not establish
   availability inside a VM, container or remote shell. If unavailable, report
   the missing dependency before attempting to wrap commands.
2. Run noisy commands through `tokenjuice wrap -- <command>`.
3. Treat compacted output as authoritative unless it explicitly requests raw
   output. For exact bytes, run `tokenjuice wrap --raw -- <command>`.
4. Keep approval decisions with WorkBuddy. Wrapping does not grant permission
   to run a command. Do not change the requested operation to obtain compaction.
5. Check the wrapped command's status and stderr. Do not claim that a failed
   command succeeded. Report the result to the user concisely.

This skill guides command selection. It does not intercept tools or replace
output from commands that WorkBuddy runs without the wrapper.
