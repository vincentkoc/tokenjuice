# Qodo integration

Qodo support is beta.

`tokenjuice install qodo` inserts marker-delimited review guidance into
`.pr_agent.toml` at the current git/project root. Qodo reads repository config
from `.pr_agent.toml`, and its `[review_agent]` section supports
`issues_user_guidelines` and `compliance_user_guidelines`, so tokenjuice uses
those native review-agent instruction fields.

## Install

```bash
tokenjuice install qodo
tokenjuice doctor qodo
tokenjuice uninstall qodo
```

By default tokenjuice resolves the current git root and writes
`<git-root>/.pr_agent.toml`. Set `QODO_PROJECT_DIR=/path/to/project` to target a
specific project directory during tests or scripted installs.

## Behavior

- The tokenjuice block is wrapped in `# tokenjuice:qodo begin` and
  `# tokenjuice:qodo end` comments.
- Existing Qodo config sections are preserved.
- Reinstall replaces only the tokenjuice block and keeps suffixed backups.
- Install refuses to overwrite existing user-owned
  `issues_user_guidelines` or `compliance_user_guidelines` values.
- The guidance tells Qodo review, ask, checks, and generated-fix workflows to
  prefer `tokenjuice wrap -- <command>` for noisy terminal commands.
- The only documented escape hatch is `tokenjuice wrap --raw -- <command>`.

## Current beta caveat

Qodo config is review guidance, not a command hook. This integration does not
change Qodo portal settings, intercept PR comments, or rewrite shell output; it
adds scoped reviewer guidance for Qodo workflows that suggest terminal commands.
