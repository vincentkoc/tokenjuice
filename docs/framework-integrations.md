# framework integrations

Hermes, GitHub Copilot SDK, LangChain, Mastra, and FastMCP use native result replacement. They share tokenjuice's reducers, exact-read policy, and raw bypass. Only a proven shell exit code of zero is eligible. Unknown status, failed commands, background work, and truncated captures stay unchanged.

These integrations use the application's native plugin or middleware lifecycle. They do not add `tokenjuice install` targets or change an application's permission policy. Keep existing permission hooks when composing callbacks.

## package paths and Python setup

The npm and release packages include TypeScript exports, a Python package at `dist/python`, and a Hermes plugin at `dist/hosts/hermes/bundle`. Python adapters invoke the installed `tokenjuice compact-shell-result` JSON bridge. The bridge processes captured output; it never executes the supplied shell command.

Install tokenjuice CLI 0.10.0 or newer with Node.js 22 or newer. Install the
[Python adapters from PyPI](https://pypi.org/project/tokenjuice-integrations/)
in the application's Python 3.11 or newer environment:

```sh
npm install --global tokenjuice
python -m pip install 'tokenjuice-integrations[langchain,fastmcp]'
```

Install only the extras your application uses. The Hermes bundle needs no Python
extras. Bundled installation remains available: pass the absolute
`dist/python[langchain,fastmcp]` path from an npm package or release tarball to
`python -m pip install`. For a source checkout, run `pnpm build` first.

Keep `tokenjuice` on the application's PATH, or set `TOKENJUICE_BIN` to its executable path. Embedded Python applications can supply `launcher=["node", "/path/to/tokenjuice/dist/cli/main.js"]`. Launchers are argument vectors, never shell strings. Missing executables, invalid responses, inputs over 2 MB, and five-second bridge timeouts preserve the original result. Python bridge calls disable tokenjuice statistics.

## Hermes

The source plugin is self-contained at `src/python/tokenjuice_integrations`, so
Hermes Git installs can select that subdirectory at an exact commit. It requires
Hermes 0.22.5 or newer and a separately installed tokenjuice CLI. The plugin's
[README](../src/python/tokenjuice_integrations/README.md) describes its subprocess,
configuration, and permission boundaries. CI verifies both source and release
bundles through the same native lifecycle and model-request tests.

Copy the bundle into Hermes's native user-plugin directory, then enable and verify it through Hermes. The existence check protects an existing installation:

```sh
TOKENJUICE_PACKAGE="$(npm root -g)/tokenjuice"
PLUGINS="${HERMES_HOME:-$HOME/.hermes}/plugins"
mkdir -p "$PLUGINS"
test ! -e "$PLUGINS/tokenjuice" && cp -R "$TOKENJUICE_PACKAGE/dist/hosts/hermes/bundle" "$PLUGINS/tokenjuice"
hermes plugins enable tokenjuice
hermes plugins doctor tokenjuice
```

The plugin registers `transform_terminal_output`, which replaces foreground terminal output before Hermes constructs the tool result. Hermes retains exit status and applies its own final output limit and redaction. Background polling has no environment provenance and is left unchanged. The observation-only `post_tool_call` hook is not used.

Disable or remove through the same manager:

```sh
hermes plugins disable tokenjuice
hermes plugins remove tokenjuice
```

For an upgrade, disable and remove the old plugin before copying the new bundle. Hermes 0.22.5's `plugins install` accepts Git sources rather than unpacked local directories; use the directory-discovery route above for the npm/release bundle.

See the official [terminal transform contract](https://hermes-agent.nousresearch.com/docs/user-guide/features/hooks) and [plugin lifecycle](https://hermes-agent.nousresearch.com/docs/developer-guide/plugins).

## GitHub Copilot SDK

```ts
import { createCopilotSdkHooks } from "tokenjuice/copilot-sdk";

const session = await client.createSession({
  // Keep your model, provider, and permission configuration here.
  hooks: createCopilotSdkHooks(),
});
```

Compose `onPostToolUse` with any existing callback; do not silently overwrite application hooks. The adapter handles native `bash` results with a recognized completion footer and exit zero. It preserves the result envelope, telemetry, session log, and completion footer. Failed, running, unknown, and non-Bash results pass through. A successful tool invocation alone does not prove that its shell command succeeded.

See [Copilot SDK post-tool hooks](https://docs.github.com/en/copilot/how-tos/copilot-sdk/hooks/post-tool-use).

## LangChain

Use the [Python setup](#package-paths-and-python-setup) with the `langchain` extra.

```python
from langchain.agents import create_agent
from tokenjuice_integrations.langchain import TokenjuiceMiddleware

def decode(request, result):
    if request.tool_call["name"] == "bash":
        return result.artifact  # Your tool's trusted execution record.
    return None

agent = create_agent(model, tools=[bash], middleware=[TokenjuiceMiddleware(decode)])
```

The example assumes `bash` returns `ToolMessage.content` as the captured text and an artifact shaped as `{"command": str, "output": str, "exitCode": int}`. Configure LangChain tools with `response_format="content_and_artifact"` to retain that execution record. Map your own schema explicitly. Never invent an exit code from tool success.

Both sync and async tool middleware are supported. The adapter replaces only string content that equals the decoder's captured output. It preserves call identity, artifact, status, and other message fields. Error messages, mixed content blocks, and LangGraph `Command` results pass through. Native handler exceptions propagate.

See [LangChain custom middleware](https://docs.langchain.com/oss/python/langchain/middleware/custom).

## Mastra

```ts
import { createMastraProcessor } from "tokenjuice/mastra";

const processor = createMastraProcessor({
  decode: ({ toolName, result }) => {
    if (toolName !== "bash" || !result || typeof result !== "object") return;
    const value = result as Record<string, unknown>;
    if (typeof value.command !== "string" || typeof value.output !== "string"
      || typeof value.exitCode !== "number") return;
    return { command: value.command, output: value.output, exitCode: value.exitCode };
  },
  replace: (result, text) => ({ ...(result as object), output: text }),
});

// Include processor in your Agent's outputProcessors array.
```

The mapping belongs to the application because Mastra tools do not share a shell-result schema. Include `cwd`, `background`, and `truncated` when your executor exposes them. Replacement uses native `messageList.updateToolInvocation`, so model history and downstream tool events share the updated invocation. Mapping/compaction failures preserve the original result; native message-list errors propagate.

See [Mastra processToolResult](https://mastra.ai/reference/processors/processor-interface#processtoolresult).

## FastMCP

Use the [Python setup](#package-paths-and-python-setup) with the `fastmcp` extra.

```python
import json
from fastmcp import FastMCP
from fastmcp.tools import ToolResult
from mcp.types import TextContent
from tokenjuice_integrations.fastmcp import TokenjuiceMiddleware

def decode(context, result):
    if context.message.name == "bash":
        return result.structured_content

def replace(result, text):
    data = {**result.structured_content, "output": text}
    return ToolResult(content=[TextContent(type="text", text=json.dumps(data))],
                      structured_content=data, meta=result.meta)

server = FastMCP("shell", middleware=[TokenjuiceMiddleware(decode, replace)])
```

This example assumes the structured result contains `command`, `output`, and `exitCode`. The replacement callback must keep text content, structured content, schema, and metadata coherent. Error results and native tool exceptions retain their host behavior. This middleware also works on a FastMCP server backed by `ProxyProvider`; it affects only tools routed through that MCP server. It does not intercept the agent host's native terminal tool.

See [FastMCP response middleware](https://gofastmcp.com/servers/middleware#modifying-responses) and [proxy providers](https://gofastmcp.com/servers/providers/proxy).

## verification and removal

CI pins Hermes v0.22.5 (`bf0203a794a07aac3ff764972ab9087baa4e4f4e`), Copilot SDK 1.0.28, Mastra 1.81.0, LangChain 1.4.7, and FastMCP 4.1.4. `scripts/hermes-e2e.py` verifies native plugin doctor/discovery/removal and Agent model requests. `scripts/frameworks-node-e2e.mjs` inspects follow-up native SDK/Agent model requests through a loopback provider. `scripts/frameworks-python-e2e.py` inspects sync/async LangChain model requests and FastMCP proxy client results. No external model credentials are needed.

Remove SDK hooks, middleware, or output processors from the owning application to disable the integration. Uninstall the optional Python distribution with `python -m pip uninstall tokenjuice-integrations` in that environment. Hermes uses its native lifecycle above. tokenjuice does not edit application source or Python environments automatically.
