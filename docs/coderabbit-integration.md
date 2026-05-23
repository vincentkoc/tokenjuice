# CodeRabbit integration

CodeRabbit support is beta.

`tokenjuice install coderabbit` inserts marker-delimited path review
instructions into `.coderabbit.yaml` at the current git/project root.
CodeRabbit reads repository configuration from `.coderabbit.yaml`, and its
`reviews.path_instructions` list is the native YAML surface for custom review
guidance scoped by glob pattern.

## Install

```bash
tokenjuice install coderabbit
tokenjuice doctor coderabbit
tokenjuice uninstall coderabbit
```

By default tokenjuice resolves the current git root and writes
`<git-root>/.coderabbit.yaml`. Set
`CODERABBIT_PROJECT_DIR=/path/to/project` to target a specific project
directory during tests or scripted installs.

## Behavior

- The tokenjuice block is wrapped in `# tokenjuice:coderabbit begin` and
  `# tokenjuice:coderabbit end` comments.
- Existing CodeRabbit config sections are preserved.
- Existing block-list `reviews.path_instructions` entries are preserved.
- Reinstall replaces only the tokenjuice block and keeps suffixed backups.
- Install refuses ambiguous inline YAML shapes such as `reviews: { ... }` or
  `path_instructions: []` instead of risking duplicate root keys.
- The path instruction tells CodeRabbit review, finishing-touch, chat, and tool
  workflows to prefer `tokenjuice wrap -- <command>` for noisy terminal
  commands.
- The only documented escape hatch is `tokenjuice wrap --raw -- <command>`.

## Current beta caveat

CodeRabbit config is review guidance, not a command hook. This integration does
not change CodeRabbit app settings, intercept PR comments, or rewrite shell
output; it adds scoped reviewer guidance for CodeRabbit workflows that suggest
terminal commands.
