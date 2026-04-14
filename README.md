# tokenjuice

lean output compaction for terminal-heavy agent workflows.

## why

tool output wastes absurd amounts of context.

`tokenjuice` compacts observed output after execution, keeps the raw output as a local artifact, and gives hosts a boring, deterministic summary by default.

## goals

- library first, not framework-locked
- JSON rules for parseability and inspection
- explicit `reduce` and `wrap` modes
- file-backed artifacts that are easy to debug
- no silent command rewrite

## commands

```bash
tokenjuice reduce [file]
tokenjuice wrap -- <command> [args...]
tokenjuice ls
tokenjuice cat <artifact-id>
```

## status

first implementation slice. enough to shape the package and prove the core loop.
