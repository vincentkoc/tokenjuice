import type { HostCommandHandler, ParsedArgs } from "./command-types.js";

export function createHostCommand<Result>(
  run: (args: ParsedArgs) => Promise<Result>,
  writeText: (result: Result, args: ParsedArgs) => void,
): HostCommandHandler {
  return async (args) => {
    const result = await run(args);
    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    } else {
      writeText(result, args);
    }
    return 0;
  };
}
