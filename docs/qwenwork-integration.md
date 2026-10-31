# QwenWork integration

```bash
tokenjuice install qwenwork
tokenjuice doctor qwenwork
tokenjuice uninstall qwenwork
```

The installer writes `~/.qwenwork/skills/tokenjuice/SKILL.md`, the user skill
discovery directory documented by QwenWork. It refuses to replace a foreign
file and backs up owned guidance before refreshing it. Uninstall removes only
the owned file; supporting files and backups remain.

This is a guidance skill. It asks QwenWork to use `tokenjuice wrap -- <command>`
for noisy output and `tokenjuice wrap --raw -- <command>` for exact bytes.
QwenWork retains execution and approval decisions. The skill first checks
`tokenjuice --version` inside the actual execution environment. Install
tokenjuice there before relying on wrapping; the desktop PATH is insufficient.

Start a new conversation and select the skill using `/`, or ask QwenWork to
use the tokenjuice skill. `@` adds context rather than invoking a skill. Check
that a noisy terminal result is compacted in the next model request, and that
an exact file read and a failing command retain their bytes/status.

Doctor checks the local managed file. Live skill discovery and execution remain
unqualified. QwenWork is separate from Qwen Code; `install qwen-code` configures
a different product.

Contract: [QwenWork skills](https://www.alibabacloud.com/help/zh/qwenwork/skills).
