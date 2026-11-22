import { spawn } from "node:child_process";

export function createProcessRunner({ cwd, env }) {
  return async function run(command, args, timeout = 90_000) {
    return await new Promise((resolveResult, reject) => {
      const child = spawn(command, args, { cwd, env, stdio: ["ignore", "pipe", "pipe"] });
      let stdout = "";
      let stderr = "";
      const timer = setTimeout(() => {
        child.kill("SIGTERM");
        reject(new Error(`timed out running ${command}\n${stderr}\n${stdout}`));
      }, timeout);
      child.stdout.setEncoding("utf8").on("data", (chunk) => { stdout += chunk; });
      child.stderr.setEncoding("utf8").on("data", (chunk) => { stderr += chunk; });
      child.on("error", (error) => { clearTimeout(timer); reject(error); });
      child.on("close", (code) => {
        clearTimeout(timer);
        if (code !== 0) reject(new Error(`${command} exited ${code}\n${stderr}\n${stdout}`));
        else resolveResult({ stdout, stderr });
      });
    });
  };
}
