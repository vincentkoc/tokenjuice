"""FastMCP response middleware, including servers backed by a proxy provider."""
from fastmcp.server.middleware import Middleware

from .bridge import acompact_result


class TokenjuiceMiddleware(Middleware):
    def __init__(self, decode, replace, *, launcher=None):
        self.decode = decode
        self.replace = replace
        self.launcher = launcher

    async def on_call_tool(self, context, call_next):
        result = await call_next(context)
        if getattr(result, "isError", False) or getattr(result, "is_error", False):
            return result
        try:
            execution = self.decode(context, result)
            if execution is None:
                return result
            text = await acompact_result("fastmcp", execution, launcher=self.launcher)
            return self.replace(result, text) if text is not None else result
        except Exception:
            return result
