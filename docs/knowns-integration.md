# Knowns integration

Knowns support is beta.

`tokenjuice install knowns` inserts a marker-delimited instruction block into
`KNOWNS.md` at the current git/project root. Knowns gives AI assistants project
memory, tasks, specs, docs, code intelligence, and MCP access; tokenjuice adds
terminal-output compaction guidance to that context instead of installing a
command hook.

## Install

```bash
tokenjuice install knowns
tokenjuice doctor knowns
tokenjuice uninstall knowns
```

By default tokenjuice resolves the current git root and updates
`<git-root>/KNOWNS.md`. Set `KNOWNS_PROJECT_DIR=/path/to/project` to target a
specific project directory during tests or scripted installs.

## Behavior

- The instruction block tells AI assistants working from Knowns context to
  prefer `tokenjuice wrap -- <command>` for terminal commands likely to produce
  long output.
- The instruction block tells those assistants to treat compacted output as
  authoritative.
- The only documented escape hatch is `tokenjuice wrap --raw -- <command>`.
- Existing `KNOWNS.md` content is backed up before install and preserved around
  the tokenjuice block.

The managed markers are host-specific:

```markdown
<!-- tokenjuice:knowns begin -->
...
<!-- tokenjuice:knowns end -->
```

## Current beta caveat

Knowns guidance files and MCP context are not command hooks. This integration
does not initialize `.knowns/`, register the Knowns MCP server, or rewrite shell
output; it gives assistants consuming Knowns context a stable instruction to use
tokenjuice when they run noisy terminal commands.
