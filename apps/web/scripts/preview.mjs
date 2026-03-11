import { spawn } from "node:child_process";

function normalizeArgs(argv) {
  return argv[0] === "--" ? argv.slice(1) : argv;
}

const cliArgs = normalizeArgs(process.argv.slice(2));
const defaultPort = process.env.PORT || "4321";
const args =
  cliArgs.length > 0 ? cliArgs : ["--host", "0.0.0.0", "--port", defaultPort];

const child = spawn("pnpm", ["exec", "astro", "preview", ...args], {
  cwd: process.cwd(),
  env: process.env,
  stdio: "inherit"
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
