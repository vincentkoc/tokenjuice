# QoderWork integration

```bash
tokenjuice install qoderwork
tokenjuice doctor qoderwork
tokenjuice uninstall qoderwork
```

The installer writes `~/.qoderwork/skills/tokenjuice/SKILL.md`, the user skill
discovery directory documented by QoderWork. It refuses to replace a foreign
file and backs up owned guidance before refreshing it. Uninstall removes only
the owned file; supporting files and backups remain.

This is a guidance skill. It asks QoderWork to use `tokenjuice wrap -- <command>`
for noisy output and `tokenjuice wrap --raw -- <command>` for exact bytes.
QoderWork retains execution and approval decisions. The skill first checks
`tokenjuice --version` inside the actual execution environment. Install
tokenjuice there before relying on wrapping; the desktop PATH is insufficient.

Start a new conversation and select the skill using `/`, or ask QoderWork to
use the tokenjuice skill. `@` adds context rather than invoking a skill. Check
that a noisy terminal result is compacted in the next model request, and that
an exact file read and a failing command retain their bytes/status.

Doctor checks the local managed file. Live skill discovery and execution remain
unqualified. QoderWork is separate from Qoder CLI; its skill does not install the
CLI's `qoder-cli` output hook or project `qoder` instructions. The documented
[QoderWork hooks](https://docs.qoder.com/qoderwork/hooks) include execution events
but do not establish command-input or tool-output replacement fields. This
adapter therefore uses the documented skill surface.

Contracts: [QoderWork skills](https://docs.qoder.com/qoderwork/skills) and
[skill format](https://docs.qoder.com/qoderwork/skill-creation).
