# distribution

tokenjuice should ship as a compiled JavaScript terminal app first, not a fake-native binary.

that means:

- `tsc` builds the runnable CLI into `dist/`
- npm publishes the package with `bin.tokenjuice -> dist/cli/main.js`
- release builds produce a tarball with:
  - `dist/`
  - `bin/tokenjuice`
  - `package.json`
  - `README.md`
  - `LICENSE`
- Homebrew installs that tarball and wraps `dist/cli/main.js` with the brewed `node`
- nfpm builds `.deb` and `.rpm` packages that depend on `nodejs`

## why this shape

it keeps the distribution boring:

- one runtime model
- one CLI entrypoint
- no second bundler/runtime path to debug
- easy npm, `npx`, `pnpm dlx`, and global install support
- clean path to Homebrew now
- clean path to apt/dnf later through the same tarball

native single-file binaries can come later if they earn their keep. they are not the default release story yet.

## local release flow

```bash
pnpm install
pnpm test
pnpm build
pnpm release:artifacts
pnpm release:checksums
pnpm release:formula
```

that writes:

- `release/tokenjuice-v<version>.tar.gz`
- `release/sha256sums.txt`
- `release/Formula/tokenjuice.rb`

## npm

npm, pnpm, and yarn already work off the published package:

```bash
npm install -g tokenjuice
pnpm add -g tokenjuice
yarn global add tokenjuice
npx tokenjuice --help
```

## Homebrew

the release pipeline generates a formula file that targets the GitHub release tarball.

expected shape:

```bash
brew tap vincentkoc/homebrew-tap
brew install tokenjuice
```

the release flow now mirrors `autosecure`:

- GitHub release uploads `sha256sums.txt`
- `homebrew-tap.yml` updates `vincentkoc/homebrew-tap`
- the tap formula points at the GitHub release tarball

## apt / dnf / yum

linux packages are built from the same compiled payload:

- `.deb` depends on `nodejs`
- `.rpm` depends on `nodejs`
- payload lives under `/usr/lib/tokenjuice`
- `/usr/bin/tokenjuice` is a thin wrapper

publishing follows the `autosecure` pattern too:

- main release workflow can push to Cloudsmith when secrets are set
- manual `publish-apt.yml` and `publish-rpm.yml` workflows exist for retries/backfills
