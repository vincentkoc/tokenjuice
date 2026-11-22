"""Native LangChain agent and FastMCP proxy contracts; no remote model or credentials."""
import asyncio
import json
import os
from pathlib import Path
import subprocess
import sys
from unittest.mock import patch

from fastmcp import Client, FastMCP
from fastmcp.server.providers import ProxyProvider
from fastmcp.tools import ToolResult
from langchain.agents import create_agent
from langchain_core.language_models.fake_chat_models import FakeMessagesListChatModel
from langchain_core.messages import AIMessage, ToolMessage
from langchain_core.tools import tool
from mcp.types import TextContent

dist = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else Path(__file__).resolve().parents[1] / "dist"
# Exercise the installed distribution, rather than importing the build directory.
from tokenjuice_integrations.bridge import compact_result
from tokenjuice_integrations.langchain import TokenjuiceMiddleware as LangChainMiddleware
from tokenjuice_integrations.fastmcp import TokenjuiceMiddleware as FastMCPMiddleware

launcher = [os.environ.get("NODE", "node"), str(dist / "cli/main.js")]
os.environ["TOKENJUICE_STATS"] = "off"
raw = "\n".join(f"fixtures/example-{i}.json" for i in range(80))
command = "find fixtures -type f"
cases = [(command, raw, 0), (command, raw, 7), ("cat exact.txt", raw, 0),
         ("tokenjuice wrap --raw -- find fixtures -type f", raw, 0)]


class Model(FakeMessagesListChatModel):
    def bind_tools(self, tools, **kwargs):
        return self


@tool(response_format="content_and_artifact")
def bash(case: int):
    """Return captured shell output and independently tracked exit status."""
    cmd, text, code = cases[case]
    return text, {"command": cmd, "output": text, "exitCode": code, "native": True}


def decode_langchain(request, result):
    return result.artifact if request.tool_call["name"] == "bash" else None


async def langchain_contract():
    for asynchronous in (False, True):
        for index, (_, text, code) in enumerate(cases):
            model = Model(responses=[AIMessage(content="", tool_calls=[{"name": "bash", "args": {"case": index}, "id": "native-call"}]), AIMessage(content="done")])
            seen = []
            # A model callback observes actual second-request messages, not middleware return values.
            from langchain_core.callbacks import BaseCallbackHandler
            class Capture(BaseCallbackHandler):
                def on_chat_model_start(self, serialized, messages, **kwargs):
                    seen.extend(m for group in messages for m in group if isinstance(m, ToolMessage))
            agent = create_agent(model, tools=[bash], middleware=[LangChainMiddleware(decode_langchain, launcher=launcher)])
            config = {"callbacks": [Capture()]}
            payload = {"messages": [{"role": "user", "content": "run the fixture"}]}
            state = await agent.ainvoke(payload, config) if asynchronous else agent.invoke(payload, config)
            assert len(seen) == 1 and seen[0].tool_call_id == "native-call"
            assert seen[0].artifact == {"command": cases[index][0], "output": text, "exitCode": code, "native": True}
            assert state["messages"][-1].content == "done"
            if index == 0:
                assert "80 matches" in seen[0].content and len(seen[0].content) < len(text)
            else:
                assert seen[0].content == text


async def fastmcp_contract():
    upstream = FastMCP("native upstream")
    @upstream.tool
    def bash(case: int) -> ToolResult:
        cmd, text, code = cases[case]
        data = {"command": cmd, "output": text, "exitCode": code, "native": True}
        return ToolResult(content=[TextContent(type="text", text=json.dumps(data))], structured_content=data, meta={"native": True})

    def decode(context, result):
        return result.structured_content if context.message.name == "bash" else None

    def replace(result, text):
        data = {**result.structured_content, "output": text}
        return ToolResult(content=[TextContent(type="text", text=json.dumps(data))], structured_content=data, meta=result.meta)

    proxy = FastMCP("native proxy", providers=[ProxyProvider(lambda: Client(upstream))],
                    middleware=[FastMCPMiddleware(decode, replace, launcher=launcher)])
    async with Client(proxy) as client:
        for index, (_, text, code) in enumerate(cases):
            result = await client.call_tool("bash", {"case": index})
            data = result.structured_content
            assert data["exitCode"] == code and data["native"] is True
            assert json.loads(result.content[0].text) == data
            if index == 0:
                assert "80 matches" in data["output"] and len(data["output"]) < len(text)
            else:
                assert data["output"] == text


def bridge_contract():
    execution = {"command": command, "output": raw, "exitCode": 0}
    assert compact_result("langchain", execution, launcher=launcher)
    assert compact_result("langchain", {**execution, "exitCode": True}, launcher=launcher) is None
    assert compact_result("langchain", execution, launcher=["missing-tokenjuice-fixture"]) is None
    for response in [b"[]", b"not json", b'{"action":"rewrite","text":1}']:
        with patch("subprocess.run", return_value=subprocess.CompletedProcess([], 0, response)):
            assert compact_result("langchain", execution, launcher=launcher) is None
    with patch("subprocess.run", side_effect=subprocess.TimeoutExpired("fixture", 5)):
        assert compact_result("langchain", execution, launcher=launcher) is None


async def main():
    bridge_contract()
    await langchain_contract()
    await fastmcp_contract()
    print("native LangChain sync/async model requests and FastMCP proxy contracts passed")


asyncio.run(main())
