"""LangChain sync/async middleware for explicitly mapped shell tools."""
from langchain.agents.middleware import AgentMiddleware
from langchain_core.messages import ToolMessage

from .bridge import acompact_result, compact_result


class TokenjuiceMiddleware(AgentMiddleware):
    def __init__(self, decode, *, launcher=None):
        self.decode = decode
        self.launcher = launcher

    def _execution(self, request, result):
        if not isinstance(result, ToolMessage) or result.status == "error" or not isinstance(result.content, str):
            return None
        try:
            execution = self.decode(request, result)
            if isinstance(execution, dict) and execution.get("output") == result.content:
                return execution
        except Exception:
            pass
        return None

    def wrap_tool_call(self, request, handler):
        result = handler(request)
        execution = self._execution(request, result)
        if execution is None:
            return result
        text = compact_result("langchain", execution, launcher=self.launcher)
        return result.model_copy(update={"content": text}) if text is not None else result

    async def awrap_tool_call(self, request, handler):
        result = await handler(request)
        execution = self._execution(request, result)
        if execution is None:
            return result
        text = await acompact_result("langchain", execution, launcher=self.launcher)
        return result.model_copy(update={"content": text}) if text is not None else result
