<img src="docs/tokenjuice.jpg" alt="tokenjuice banner"/>

# tokenjuice 🧃

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
- speed and reliability over gimmicks

## commands

```bash
tokenjuice reduce [file]
tokenjuice wrap -- <command> [args...]
tokenjuice ls
tokenjuice cat <artifact-id>
tokenjuice verify
tokenjuice discover
tokenjuice doctor
```

## rule system

- built-in JSON rules live in `src/rules`
- user overrides live in `~/.config/tokenjuice/rules`
- project overrides live in `.tokenjuice/rules`
- later layers override earlier ones by rule id

run `tokenjuice verify` to validate the loaded rules.

use `tokenjuice discover` to find missing or weak reducer candidates from stored artifacts.

use `tokenjuice doctor` to inspect coverage, generic fallbacks, weak reducers, and savings ratios.

## docs

- spec: `docs/spec.md`
- rules: `docs/rules.md`

## status

usable foundation with diagnostics and a growing reducer set, now focused on deeper coverage and tuning.

💙 built by [Vincent Koc](https://github.com/vincentkoc).
