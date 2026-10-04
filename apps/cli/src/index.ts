#!/usr/bin/env node
import { runTunnel } from "./commands/tunnel.js";
import { runLogin } from "./commands/login.js";

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  if (command === "login") {
    await runLogin(rest);
    return;
  }
  if (command === "tunnel") {
    await runTunnel(rest);
    return;
  }
  process.stderr.write(
    "Usage:\n  relay login [--worker-url <url>] [--project <slug>]\n  relay tunnel --to <local-url> [--worker-url <url>] [--project <slug>] [--endpoint <path> | --temp-endpoint] [--api-key <key> | --tunnel-token <token>]\n"
  );
  process.exit(1);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
