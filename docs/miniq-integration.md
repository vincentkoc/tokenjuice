# miniQ integration

Run these commands from the workspace open in miniQ:

```sh
tokenjuice install miniq
tokenjuice doctor miniq
tokenjuice uninstall miniq
```

The installer writes `.miniq/skills/tokenjuice/SKILL.md` in the current directory.
miniQ discovers that workspace-native skill directory before `.agents/skills`
and its user-global skills. Installation is idempotent, refuses foreign files
and unsafe links, and backs up modified owned guidance when refreshing it.
Uninstall removes only the owned file, retaining backups and sibling files.

This is a guidance skill. It asks miniQ to use `tokenjuice wrap -- <command>` for
noisy output and retain exact bytes with `tokenjuice wrap --raw -- <command>`.
It first checks tokenjuice in the actual execution environment; an installation
on the desktop does not establish availability inside a VM or remote shell.
miniQ retains command selection, execution and approval decisions.

Open that workspace in miniQ and check that the tokenjuice skill is enabled.
miniQ stores disabled skill names separately in `skills-state.json`; the
installer does not change that state. Doctor only validates the local file. It
does not verify discovery, enabled state or model adherence. For live acceptance,
inspect the next model request after a noisy successful command, an exact read,
explicit raw output and a failing command.

The native contract was inspected at miniQ commit
[`a71d4e223b1204b5550f65b884818a1fe292557a`](https://github.com/LeadingThink/miniQ/tree/a71d4e223b1204b5550f65b884818a1fe292557a):
[skill discovery and state](https://github.com/LeadingThink/miniQ/blob/a71d4e223b1204b5550f65b884818a1fe292557a/crates/miniq-skills/src/store.rs),
[frontmatter parser](https://github.com/LeadingThink/miniQ/blob/a71d4e223b1204b5550f65b884818a1fe292557a/crates/miniq-skills/src/parse.rs),
and [hook consumer](https://github.com/LeadingThink/miniQ/blob/a71d4e223b1204b5550f65b884818a1fe292557a/crates/miniq-daemon/src/executor.rs).
The inspected hooks block calls or append feedback; they do not consume
replacement command or output fields. No automatic compaction is claimed.
