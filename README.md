<img src="docs/tokenjuice.jpg" alt="tokenjuice banner"/>

# tokenjuice 🧃

lean output compaction for terminal-heavy agent workflows.

## what it does

an agent or harness calls noisy tools like `git status`, `pnpm test`, `pnpm --help`, `docker build`, or `rg`.

tokenjuice sits in front of that tool call, runs it, trims the fat from the output, and passes back a much cleaner result to the harness.

the important bit is the boundary:

- the original command still runs
- tokenjuice compacts the observed output after execution
- raw output can be stored locally when you explicitly ask for it
- the harness gets a smaller, more useful payload instead of a wall of terminal junk

## install

```bash
npm install -g tokenjuice
# or
pnpm add -g tokenjuice
# or
yarn global add tokenjuice
# or
brew tap vincentkoc/homebrew-tap
brew install tokenjuice
```

then:

```bash
tokenjuice --help
tokenjuice --version
```

## why

tool output wastes absurd amounts of context. your llm needs a diet.

tokenjuice compacts observed output after execution, gives hosts a boring, deterministic summary by default, and only stores raw output when you explicitly ask for it.

## goals

- library first, not framework-locked
- JSON rules for parseability and inspection
- explicit `reduce` and `wrap` modes
- file-backed artifacts that are easy to debug
- no silent command rewrite
- speed and reliability over gimmicks

## commands

```bash
tokenjuice --help
tokenjuice --version
tokenjuice reduce [file]
tokenjuice reduce-json [file]
tokenjuice wrap -- <command> [args...]
tokenjuice wrap --store -- <command> [args...]
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

library-side adapters can also use `runReduceJsonCli(...)` to call the CLI without rebuilding the child-process + JSON plumbing themselves.

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

## rule system

- built-in JSON rules live in `src/rules`
- user overrides live in `~/.config/tokenjuice/rules`
- project overrides live in `.tokenjuice/rules`
- later layers override earlier ones by rule id

## docs

- spec: `docs/spec.md`
- rules: `docs/rules.md`
- security: `SECURITY.md`

## status

usable foundation for token reduction with diagnostics and a growing reducer set, now focused on deeper coverage and tuning.

💙 built by [Vincent Koc](https://github.com/vincentkoc).
