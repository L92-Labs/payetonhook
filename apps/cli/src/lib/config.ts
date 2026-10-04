import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export type CliStoredConfig = {
  workerUrl?: string;
  projectSlug?: string;
  knownProjects?: string[];
  cliSessionToken?: string;
  cliSessionExpiresAt?: number;
  tunnelToken?: string;
  tunnelTokenExpiresAt?: number;
};

const DIR = path.join(os.homedir(), ".payetonhook");
const FILE = path.join(DIR, "config.json");

export function readCliConfig(): CliStoredConfig {
  try {
    const raw = fs.readFileSync(FILE, "utf8");
    return JSON.parse(raw) as CliStoredConfig;
  } catch {
    return {};
  }
}

export function writeCliConfig(config: CliStoredConfig): void {
  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(config, null, 2));
}

export function configFilePath(): string {
  return FILE;
}
