import type { PiContext, PiTheme } from "./pi-types.js";
import type { TokenjuiceStatusSnapshot } from "./status.js";
import { formatCompactNumber } from "./status.js";

function visibleWidth(text: string): number {
  return String(text).replace(/\x1b\[[0-9;]*m/g, "").length;
}

function truncateToWidth(text: string, width: number): string {
  if (visibleWidth(text) <= width) {
    return text;
  }

  const plain = String(text).replace(/\x1b\[[0-9;]*m/g, "");
  return plain.slice(0, Math.max(0, width));
}

function padToWidth(text: string, width: number): string {
  const truncated = truncateToWidth(text, width);
  return truncated + " ".repeat(Math.max(0, width - visibleWidth(truncated)));
}

function line(theme: PiTheme, label: string, value: string, width: number): string {
  return truncateToWidth(`  ${theme.fg("dim", `${label}:`)} ${value}`, width);
}

function stateColor(theme: PiTheme, on: boolean, offStyle: "warning" | "dim" = "dim") {
  return on ? theme.fg("success", "on") : theme.fg(offStyle, "off");
}

export async function showTokenjuiceStatusPanel(
  ctx: PiContext,
  snapshot: TokenjuiceStatusSnapshot,
): Promise<void> {
  if (!ctx.hasUI || typeof ctx.ui.custom !== "function") {
    ctx.ui.notify(
      `tokenjuice manual ${snapshot.manualEnabled ? "on" : "off"}; pi auto-compaction ${snapshot.autoCompactEnabled ? "on" : "off"}; effective ${snapshot.effectiveEnabled ? "on" : "off"}; bypass-next ${snapshot.bypassNext ? "armed" : "idle"}`,
      "info",
    );
    return;
  }

  await ctx.ui.custom(
    (_tui, theme, _keybindings, done) => ({
      render(width: number) {
        const panelWidth = Math.max(44, Math.min(width, 68));
        const innerWidth = Math.max(38, panelWidth - 4);
        const lines = [
          theme.fg("accent", "tokenjuice"),
          "",
          theme.fg("dim", "state"),
          line(theme, "manual", stateColor(theme, snapshot.manualEnabled), innerWidth),
          line(theme, "pi auto-compaction", stateColor(theme, snapshot.autoCompactEnabled, "warning"), innerWidth),
          line(theme, "effective", stateColor(theme, snapshot.effectiveEnabled, "warning"), innerWidth),
          line(theme, "bypass-next", snapshot.bypassNext ? theme.fg("warning", "armed") : theme.fg("dim", "idle"), innerWidth),
          "",
          theme.fg("dim", "session savings"),
          line(theme, "compacted results", String(snapshot.compactedCount), innerWidth),
          line(theme, "saved chars", formatCompactNumber(snapshot.savedChars), innerWidth),
          line(theme, "raw chars", formatCompactNumber(snapshot.rawChars), innerWidth),
          line(theme, "reduced chars", formatCompactNumber(snapshot.reducedChars), innerWidth),
          line(theme, "avg saved/result", formatCompactNumber(snapshot.averageSavedChars), innerWidth),
          ...(snapshot.lastReducer ? [line(theme, "last reducer", snapshot.lastReducer, innerWidth)] : []),
          "",
          theme.fg("dim", "commands"),
          truncateToWidth("  /tj on   /tj off   /tj raw-next", innerWidth),
          "",
          theme.fg("dim", "esc / enter / q to close"),
        ];

        const border = theme.fg("dim", `┌${"─".repeat(innerWidth + 2)}┐`);
        const footer = theme.fg("dim", `└${"─".repeat(innerWidth + 2)}┘`);
        const boxedLines = lines.map((content) => `${theme.fg("dim", "│")} ${padToWidth(content, innerWidth)} ${theme.fg("dim", "│")}`);
        return [border, ...boxedLines, footer];
      },
      handleInput(data: string) {
        if (data === "\r" || data === "\n" || data === "q" || data === "\u001b") {
          done(undefined);
        }
      },
      invalidate() {},
    }),
    { overlay: true },
  );
}
