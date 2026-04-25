# Repository Guidelines

## Project Structure & Module Organization

`tokenjuice` is a TypeScript CLI/library. Main source lives in `src/`:

- `src/cli/` contains the CLI entrypoint.
- `src/core/` contains shared reducers, rule loading, and other host-agnostic logic.
- `src/hosts/` contains host-specific integrations (`codex/`, `claude-code/`, `cursor/`, `pi/`, `opencode/`, `openclaw/`) plus shared hook helpers under `shared/`.
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

Every post-tool host adapter (codex, claude-code, pi, opencode, openclaw) routes through the shared primitive `compactBashResult` in [src/core/integrations/compact-bash-result.ts](src/core/integrations/compact-bash-result.ts). New host behavior belongs in `src/core/`, not in an adapter. Cursor is the only pre-tool rewriter and funnels its command through `tokenjuice wrap`. When adding or changing a host, see [docs/integration-playbook.md](docs/integration-playbook.md) for the install/doctor/uninstall checklist and update the hardcoded host list in [src/cli/main.ts](src/cli/main.ts) accordingly.

## Testing Guidelines

This repo uses Vitest in Node (`vitest.config.ts`). Add or update tests with every behavior change, especially for CLI flows, hook parsing, and rule matching. Prefer targeted runs while iterating, then finish with `pnpm verify` before handoff.

Host tests read environment variables (`CODEX_HOME`, `CLAUDE_CONFIG_DIR`, `CURSOR_HOME`, `PI_CODING_AGENT_DIR`, `OPENCODE_CONFIG_DIR`, `TOKENJUICE_CURSOR_SHELL`, `SHELL`, `HOME`, `PATH`, `process.platform`). Any new host suite must snapshot and restore them; follow the existing files in [test/hosts/](test/hosts/) as the pattern.

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

1. Bump `package.json` to the target version (for example `0.6.0`).
2. Run `pnpm release:local` to verify tests, build output, release tarball, checksums, and Homebrew formula generation.
3. Commit the version bump and any required workflow fixes to `main`, then push `main`.
4. Create and push an annotated tag: `git tag -a v0.6.0 -m "v0.6.0"` and `git push origin v0.6.0`.
5. Watch the `Release` GitHub Actions workflow and confirm the GitHub release is published with the `.tar.gz`, `.deb`, `.rpm`, `sha256sums.txt`, and `tokenjuice.rb` assets.
6. Confirm the `homebrew-tap.yml` sync workflow succeeds and that `vincentkoc/tap` points at the new tarball and SHA.

If a release tag was pushed against a broken workflow, fix `main`, delete and recreate the tag, then rerun the release from the corrected commit.

## Commit & Pull Request Guidelines

Recent history favors short, imperative subjects, usually Conventional Commit style, for example:

- `feat(cursor): add integration with robust shell normalization`
- `fix(release): use supported Go for nfpm`
- `chore(release): v0.6.0`

PRs should include a concise summary, the reason for the change, and a test plan with exact commands. Call out docs or release impact when relevant.
