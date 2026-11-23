# Repository Guidelines

## Project Structure & Module Organization

`token-glace` is a TypeScript CLI/library (the `tokenjuice` launcher still ships as a legacy alias). Main source lives in `src/`:

- `src/cli/` contains the CLI entrypoint.
- `src/core/` contains shared reducers, rule loading, and other host-agnostic logic.
- `src/hosts/` contains one adapter per client (first-class plus beta presets) plus shared hook helpers under `shared/`.
- `src/rules/` contains built-in JSON rules and fixtures.

Tests live in `test/` and mirror the source layout (`test/core/`, `test/hosts/`, `test/hosts/shared/`). Supporting docs live in `docs/`, packaging files in `packaging/`, and utility scripts in `scripts/`. `dist/`, `release/`, and `src/core/builtin-rules.generated.ts` are generated outputs; do not hand-edit them.

## Build, Test, and Development Commands

- `pnpm install` installs dependencies.
- `pnpm test` runs the full Vitest suite and regenerates built-in rules first.
- `pnpm typecheck` runs TypeScript without emitting files.
- `pnpm build` rebuilds `dist/`, Pi runtime output, and packaged rules.
- `pnpm verify` is the pre-handoff gate: lint, circular-dep check (madge), typecheck, and the full Vitest suite.
- `pnpm release:local` runs the local release pipeline: tests, build, tarball, checksums, and Homebrew formula.
- `pnpm exec vitest run test/hosts/codex.test.ts` runs a focused test file during iteration.

For a quick smoke check after building, run `node dist/cli/main.js --version`.

## Coding Style & Naming Conventions

Use TypeScript with ESM imports and explicit `.js` import suffixes in source files. Match the existing style:

- 2-space indentation
- named exports over default exports for library modules
- small, focused helpers in `src/core/`
- descriptive test names using `describe` / `it`

Keep generated files out of manual edits. If you change built-in rule data, rely on the existing scripts and test/build flows to regenerate derived output.

## Host integrations

Post-tool adapters that can replace shell output (codex, pi, opencode, openclaw, and other hook-based hosts) route through the shared primitive `compactBashResult` in [src/core/integrations/compact-bash-result.ts](src/core/integrations/compact-bash-result.ts). New compaction behavior belongs in `src/core/`, not in an adapter. Pre-tool rewriters (codebuddy, cursor, vscode-copilot, opt-in claude-code, and similar hosts) funnel commands through `token-glace wrap` / `tokenjuice wrap`. Shared wrap helpers live in [src/hosts/shared/pre-tool-wrap.ts](src/hosts/shared/pre-tool-wrap.ts); some hosts implement the same wrap locally. When adding or changing a host, see [docs/integration-playbook.md](docs/integration-playbook.md) for the install/doctor/uninstall checklist, then register the host in the CLI handler maps ([src/cli/install-commands.ts](src/cli/install-commands.ts), [src/cli/uninstall-commands.ts](src/cli/uninstall-commands.ts), [src/cli/doctor-commands.ts](src/cli/doctor-commands.ts)), update the supported-host lists in [src/cli/main.ts](src/cli/main.ts), and add it to the transcript test in [test/cli/host-commands.test.ts](test/cli/host-commands.test.ts).

## Testing Guidelines

This repo uses Vitest in Node (`vitest.config.ts`). Add or update tests with every behavior change, especially for CLI flows, hook parsing, and rule matching. Prefer targeted runs while iterating, then finish with `pnpm verify` before handoff.

Host tests read environment variables (`CODEX_HOME`, `CLAUDE_CONFIG_DIR`, `CURSOR_HOME`, `PI_CODING_AGENT_DIR`, `OPENCODE_CONFIG_DIR`, `TOKENJUICE_CURSOR_SHELL`, `SHELL`, `HOME`, `PATH`, `process.platform`). Any new host suite must snapshot and restore them; follow the existing files in [test/hosts/](test/hosts/) as the pattern.

For non-trivial code changes, run `.agents/skills/autoreview/scripts/autoreview --mode auto` before handoff and address accepted/actionable findings.

## Brigade work loop

When this checkout has local Brigade wiring (a `.brigade/` directory, or `brigade status --target .` succeeds), start a session with `brigade work brief --target .`. Run checks through `brigade work verify run --target . --command "<test>"` so the exit code is stored as a receipt. Capture the outcome against the skill or card that did the work only when the outcome ledger is healthy. Finish durable knowledge with a memory handoff. Brigade wiring and memory handoffs in this repository are machine-local. A corrupt or half-fed ledger is not a working capture path; inspect it with `brigade outcome doctor` before anyone repairs it.

## Further reading

In-repo docs (link, don't duplicate):

- [docs/spec.md](docs/spec.md) — reducer semantics and supported hosts
- [docs/rules.md](docs/rules.md) — JSON rule schema and authoring guide
- [docs/integration-playbook.md](docs/integration-playbook.md) — per-host integration + regression checklist
- [docs/cursor-integration.md](docs/cursor-integration.md) — pre-tool wrap flow specifics
- [docs/distribution.md](docs/distribution.md) — npm / Homebrew / nfpm packaging
- [docs/copilot-cli-integration.md](docs/copilot-cli-integration.md) — Copilot CLI post-tool hook specifics, including the shared `~/.copilot/hooks/` dir hazard.
- [docs/vscode-copilot-integration.md](docs/vscode-copilot-integration.md) — VS Code Copilot Chat pre-tool wrap specifics, `chat.useHooks`, and workspace trust.

## Release Process

Releases are tag-driven and should stay aligned with `package.json`.

1. Bump `package.json` and the static registry badge in `README.md` to the target version (for example `0.6.0`).
2. Run `pnpm release:local` (`pnpm verify` then `pnpm verify:package`, including publint contracts, the release tarball, checksums, and Homebrew formula).
3. Commit the version bump and any required workflow fixes to `main`, then push `main`.
4. Create and push an annotated tag: `git tag -a v0.6.0 -m "v0.6.0"` and `git push origin v0.6.0`.
5. Watch the `Release` GitHub Actions workflow and confirm the GitHub release is published with the `.tar.gz`, `.deb`, `.rpm`, `sha256sums.txt`, and `token-glace.rb` assets.
6. If a Homebrew tap is configured, manually dispatch `homebrew-tap.yml` with the release tag and confirm the tap formula points at the new tarball and SHA. The release workflow no longer dispatches it.

For formula-only recovery against an existing immutable tarball, download and verify the published checksum, then run `pnpm release:formula -- --published-tarball-sha256 <64-lowercase-hex>`. This mode is offline and does not require a local tarball. Replace only the broken formula asset; do not retag or republish unrelated artifacts.

## Commit & Pull Request Guidelines

Recent history favors short, imperative subjects, usually Conventional Commit style, for example:

- `feat(cursor): add integration with robust shell normalization`
- `fix(release): use supported Go for nfpm`
- `chore(release): v0.6.0`

PRs should include a concise summary, the reason for the change, and a test plan with exact commands. Call out docs or release impact when relevant.

## GitHub agent attribution

In Solomon's repositories, every issue body, pull request body, and GitHub comment an agent writes or edits on Solomon's behalf ends with this block. Keep the human author identity. Use the actual model, harness, and client. Credit only work performed, include the provider if a model name is ambiguous, and list each review pass. Report the exact checks and observed results above the block. Credit verification to the model that ran the checks.

```text
Sent on behalf of Solomon by <orchestrator model> via <harness> in <client>
Models used:
- Implementation/build: <model> via <harness>, or none
- Test/verification: <model> via <harness> (checks: listed above), or not run
- Review: <model> via <harness> for each pass, or none
```

Every agent-written review comment and review summary also includes `Review by <model> via <harness> in <client>`.
