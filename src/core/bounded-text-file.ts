import { constants } from "node:fs";
import { open } from "node:fs/promises";

export async function readBoundedTextFile(
  path: string,
  maxBytes: number,
  options: { regularFileOnly?: boolean } = {},
): Promise<string | null> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) {
    throw new RangeError("maxBytes must be a non-negative safe integer");
  }

  const file = await open(path, options.regularFileOnly ? constants.O_RDONLY | constants.O_NONBLOCK : "r");
  try {
    const details = await file.stat();
    if ((options.regularFileOnly && !details.isFile()) || details.size > maxBytes) {
      return null;
    }

    const chunks: Buffer[] = [];
    let totalBytes = 0;
    for (;;) {
      // Read one byte beyond the limit to detect growth after the descriptor stat.
      const buffer = Buffer.allocUnsafe(Math.min(64 * 1024, maxBytes - totalBytes + 1));
      const { bytesRead } = await file.read(buffer, 0, buffer.length, null);
      if (bytesRead === 0) {
        return Buffer.concat(chunks, totalBytes).toString("utf8");
      }
      totalBytes += bytesRead;
      if (totalBytes > maxBytes) {
        return null;
      }
      chunks.push(buffer.subarray(0, bytesRead));
    }
  } finally {
    await file.close();
  }
}
