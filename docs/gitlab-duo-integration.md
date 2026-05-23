# GitLab Duo integration

GitLab Duo support is beta.

`tokenjuice install gitlab-duo` inserts a marker-delimited custom-rules block
into `.gitlab/duo/chat-rules.md`. GitLab documents this file as the project
custom-rules path for GitLab Duo Agent Platform.

```bash
tokenjuice install gitlab-duo
tokenjuice doctor gitlab-duo
tokenjuice uninstall gitlab-duo
```

By default tokenjuice resolves the nearest git root and writes the rule there.
Set `GITLAB_DUO_PROJECT_DIR=/path/to/repo` to target a specific repository in
scripts or tests.

The installed rule tells GitLab Duo agents to use:

```bash
tokenjuice wrap -- <command>
```

for terminal commands likely to produce long output, and to use:

```bash
tokenjuice wrap --raw -- <command>
```

only when raw output is genuinely required.

Existing `.gitlab/duo/chat-rules.md` content is backed up before install and
preserved outside the managed tokenjuice block. Uninstall removes only the
tokenjuice block.

GitLab Duo also supports `AGENTS.md`, but tokenjuice uses the host-specific
custom-rules file to avoid mutating a shared cross-tool instruction file.

`doctor gitlab-duo` reports `ok` when the managed block is present and contains
the expected wrap guidance.
