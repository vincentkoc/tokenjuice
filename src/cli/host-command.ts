import type { RemoveInstructionFileResult } from "../hosts/shared/instruction-file.js";
import type { HostCommandHandler, ParsedArgs } from "./command-types.js";

export function createHostCommand<Result>(
  run: (args: ParsedArgs) => Promise<Result>,
  writeText: (result: Result, args: ParsedArgs) => void,
  getExitCode: (result: Result) => number = () => 0,
): HostCommandHandler {
  return async (args) => {
    const result = await run(args);
    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    } else {
      writeText(result, args);
    }
    return getExitCode(result);
  };
}
export function createFileUninstallCommand<PathKey extends string>(
  host: string,
  resource: string,
  pathKey: PathKey,
  run: () => Promise<RemoveInstructionFileResult<PathKey>>,
): HostCommandHandler {
  return createHostCommand(run, (result) => {
    process.stdout.write(`removed ${host} ${resource}: ${result.removed ? "yes" : "no"}\n`);
    process.stdout.write(`${resource} path: ${result[pathKey]}\n`);
    process.stdout.write(`enable: tokenjuice install ${host}\n`);
  });
}
