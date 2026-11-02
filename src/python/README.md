# tokenjuice-integrations

Python adapters for [tokenjuice](https://github.com/vincentkoc/tokenjuice), a local
tool-output compactor. LangChain tool middleware and FastMCP server/proxy
middleware replace eligible successful shell output before model consumption.
Failures, unknown exit status, exact file reads, and explicit raw requests pass
through. Applications map their own trusted execution records; tool success
alone does not establish a shell exit code.

## Install

Python 3.11 or newer and tokenjuice CLI 0.10.0 or newer are required. Install the CLI separately
with Node.js 22 or newer, and install only the Python extras your application uses:

```sh
npm install --global tokenjuice
python -m pip install "tokenjuice-integrations[langchain]"
# Or: python -m pip install "tokenjuice-integrations[fastmcp]"
```

Keep the CLI on your application's PATH or set `TOKENJUICE_BIN` to its executable
path. For an npm/release bundle, install its `dist/python` directory with the same
extras instead of a registry name.

## Configure

- [LangChain middleware and execution-record mapping](https://github.com/vincentkoc/tokenjuice/blob/main/docs/framework-integrations.md#langchain)
- [FastMCP middleware and coherent result replacement](https://github.com/vincentkoc/tokenjuice/blob/main/docs/framework-integrations.md#fastmcp)
- [Hermes native plugin installation](https://github.com/vincentkoc/tokenjuice/blob/main/docs/framework-integrations.md#hermes)

The adapters send captured output to the local `tokenjuice compact-shell-result`
subprocess. They never execute the command string in that payload. Bridge calls
disable statistics and preserve the original result on missing executables,
invalid responses, inputs over 2 MB, or five-second timeouts. No model service or
API key is required. Remove middleware from the application to disable it.

MIT-licensed. Source, issue tracking, and native contract tests are in the
[tokenjuice repository](https://github.com/vincentkoc/tokenjuice).
