export type PiEntry = {
  type?: string;
  customType?: string;
  data?: unknown;
  message?: {
    role?: string;
    usage?: {
      input?: number;
      output?: number;
      cacheRead?: number;
      cacheWrite?: number;
      cost?: { total?: number };
    };
    details?: unknown;
  };
};

export type PiTheme = {
  fg(name: string, text: string): string;
};

export type PiSessionHeader = {
  cwd: string;
};

export type PiContext = {
  cwd: string;
  hasUI: boolean;
  sessionManager: {
    getBranch(): PiEntry[];
    getEntries?(): PiEntry[];
    getCwd?(): string;
    getHeader?(): PiSessionHeader | null;
    getSessionName?(): string | undefined;
  };
  ui: {
    theme?: PiTheme;
    setStatus?(id: string, text: string | undefined): void;
    custom?<T = unknown>(
      factory: (
        tui: { requestRender(): void },
        theme: PiTheme,
        keybindings: unknown,
        done: (value: T | undefined) => void,
      ) => {
        render(width: number): string[];
        handleInput?(data: string): void;
        invalidate(): void;
      },
      options?: { overlay?: boolean },
    ): Promise<T | undefined>;
    notify(message: string, level: string): void;
  };
  getContextUsage?(): { percent?: number | null; contextWindow?: number | null } | null | undefined;
  model?: { id?: string; provider?: string; reasoning?: boolean; contextWindow?: number };
  modelRegistry?: { isUsingOAuth(model: unknown): boolean };
};

export type PiToolResultEvent = {
  toolName?: string;
  input?: unknown;
  content?: unknown;
  details?: unknown;
  isError?: boolean;
};

export type Pi = {
  on(event: string, handler: (event: unknown, ctx: PiContext) => unknown): void;
  registerCommand(name: string, command: { description: string; handler: (args: string | undefined, ctx: PiContext) => Promise<void> }): void;
  appendEntry(type: string, data: unknown): void;
  getThinkingLevel?(): string;
};

export function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
