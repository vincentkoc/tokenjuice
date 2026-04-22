export {
  buildBypassNotice,
  buildCompactionNotice,
  buildTokenjuiceDetails,
  extractTextContent,
  mergeDetails,
  type TokenjuiceDetails,
} from "../../shared/tool-result.js";
import { isRecord } from "./pi-types.js";

export function parseExitCode(text: string, isError: boolean): number {
  if (!isError) {
    return 0;
  }
  const match = text.match(/Command exited with code (\d+)/u);
  if (match?.[1]) {
    return Number(match[1]);
  }
  return 1;
}

export function extractFullOutputPath(details: unknown): string | undefined {
  if (isRecord(details) && typeof details.fullOutputPath === "string" && details.fullOutputPath) {
    return details.fullOutputPath;
  }

  return undefined;
}

export function stripPiBashEpilogue(text: string): string {
  return text
    .replace(/\n\nCommand exited with code \d+\s*$/u, "")
    .replace(/\n\nCommand timed out after \d+ seconds\s*$/u, "")
    .replace(/\n\nCommand aborted\s*$/u, "");
}
