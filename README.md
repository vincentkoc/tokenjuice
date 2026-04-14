<img src="docs/tokenjuice.jpg" alt="tokenjuice banner"/>

# tokenjuice 🧃

lean output compaction for terminal-heavy agent workflows.

## why

tool output wastes absurd amounts of context. your llm needs a diet.

tokenjuice compacts observed output after execution, keeps the raw output as a local artifact, and gives hosts a boring, deterministic summary by default.

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
tokenjuice reduce-json [file]
tokenjuice wrap -- <command> [args...]
tokenjuice ls
tokenjuice cat <artifact-id>
tokenjuice verify
tokenjuice discover
tokenjuice doctor
tokenjuice stats
```

## adapter JSON

`reduce-json` is the machine-facing adapter command. it reads JSON from stdin or a file and always writes JSON to stdout.

direct payload:

```json
{
  "toolName": "exec",
  "command": "pnpm test",
  "argv": ["pnpm", "test"],
  "combinedText": "RUN  v3.2.4 /repo\n...",
  "exitCode": 1
}
```

envelope payload:

```json
{
  "input": {
    "toolName": "exec",
    "command": "pnpm test",
    "combinedText": "RUN  v3.2.4 /repo\n...",
    "exitCode": 1
  },
  "options": {
    "classifier": "tests/pnpm-test",
    "store": true,
    "maxInlineChars": 1200
  }
}
```

## bench

```bash
pnpm bench:fixtures
pnpm bench:verify
pnpm smoke:live
```

## rule system

- built-in JSON rules live in `src/rules`
- user overrides live in `~/.config/tokenjuice/rules`
- project overrides live in `.tokenjuice/rules`
- later layers override earlier ones by rule id

## docs

- spec: `docs/spec.md`
- rules: `docs/rules.md`

## status

usable foundation with diagnostics and a growing reducer set, now focused on deeper coverage and tuning.

💙 built by [Vincent Koc](https://github.com/vincentkoc).
