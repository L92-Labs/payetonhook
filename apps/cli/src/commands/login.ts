import { spawn } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { readCliConfig, writeCliConfig, configFilePath } from "../lib/config.js";

const DEFAULT_WORKER_URL = "https://payetonhook-worker.loiu92.workers.dev";

type LoginArgs = {
  workerUrl: string;
  project: string | null;
};

async function chooseProjectInteractively(projects: string[]): Promise<string> {
  const rl = createInterface({ input, output });
  try {
    process.stdout.write(`\nSelect project:\n`);
    projects.forEach((slug, index) => {
      process.stdout.write(`  ${index + 1}) ${slug}\n`);
    });
    process.stdout.write(`  0) Enter another project slug\n\n`);
    const answer = await rl.question("Project number: ");
    const idx = Number.parseInt(answer.trim(), 10);
    if (Number.isFinite(idx) && idx >= 1 && idx <= projects.length) {
      return projects[idx - 1];
    }
    const custom = await rl.question("Project slug: ");
    const slug = custom.trim();
    if (!slug) throw new Error("Project slug is required.");
    return slug;
  } finally {
    rl.close();
  }
}

async function parseArgs(argv: string[]): Promise<LoginArgs> {
  const map = new Map<string, string>();
  for (let i = 0; i < argv.length; i += 2) {
    map.set(argv[i], argv[i + 1]);
  }
  const cfg = readCliConfig();
  const workerUrl =
    map.get("--worker-url") ??
    process.env.PAYETONHOOK_WORKER_URL ??
    cfg.workerUrl ??
    DEFAULT_WORKER_URL;

  const projectFromSources = map.get("--project") ?? process.env.PAYETONHOOK_PROJECT ?? null;
  const project = projectFromSources ? projectFromSources.trim() : null;
  return { workerUrl, project };
}

function openBrowser(url: string): void {
  const platform = process.platform;
  if (platform === "darwin") spawn("open", [url], { stdio: "ignore", detached: true }).unref();
  else if (platform === "win32") spawn("cmd", ["/c", "start", "", url], { stdio: "ignore", detached: true }).unref();
  else spawn("xdg-open", [url], { stdio: "ignore", detached: true }).unref();
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runLogin(rawArgs: string[]): Promise<void> {
  const args = await parseArgs(rawArgs);
  const base = args.workerUrl.replace(/\/$/, "");
  const discoveredProjectSlugs = new Set<string>();

  const startRes = await fetch(`${base}/api/cli/device/start`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ projectSlug: args.project })
  });
  if (!startRes.ok) {
    throw new Error(`Failed to start login (${startRes.status})`);
  }
  const start = (await startRes.json()) as {
    deviceCode: string;
    userCode: string;
    verificationUri: string;
    intervalSeconds: number;
    expiresAt: number;
  };

  process.stdout.write(`\n  ◈ CLI login started\n`);
  process.stdout.write(`  ├─ Project: ${args.project ?? "(select after login)"}\n`);
  process.stdout.write(`  ├─ Code:    ${start.userCode}\n`);
  process.stdout.write(`  └─ Verify:  ${start.verificationUri}\n\n`);
  process.stdout.write(`  Opening browser...\n\n`);
  try {
    openBrowser(start.verificationUri);
  } catch {
    process.stdout.write(`  Could not auto-open browser. Visit URL above manually.\n\n`);
  }

  const timeoutAt = Math.max(Date.now() + 5_000, Number(start.expiresAt));
  const pollEveryMs = Math.max(1000, Number(start.intervalSeconds || 3) * 1000);
  while (Date.now() < timeoutAt) {
    const pollRes = await fetch(`${base}/api/cli/device/poll`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ deviceCode: start.deviceCode })
    });
    if (pollRes.status === 202) {
      await sleep(pollEveryMs);
      continue;
    }
    const poll = (await pollRes.json().catch(() => ({}))) as {
      status?: string;
      cliSessionToken?: string;
      cliSessionExpiresAt?: number;
      projectSlug?: string;
      projects?: Array<{ id: string; slug: string; name: string }>;
    };
    if (poll.status === "needs_project") {
      const projects = poll.projects ?? [];
      projects.forEach((project) => discoveredProjectSlugs.add(project.slug));
      if (projects.length === 0) {
        await sleep(pollEveryMs);
        continue;
      }
      let selected = projects[0];
      if (projects.length > 1) {
        const choice = await chooseProjectInteractively(projects.map((project) => `${project.slug} — ${project.name}`));
        const index = projects.findIndex((project) => `${project.slug} — ${project.name}` === choice);
        selected = projects[index >= 0 ? index : 0];
      }
      const selectRes = await fetch(`${base}/api/cli/device/select`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ deviceCode: start.deviceCode, projectId: selected.id })
      });
      if (!selectRes.ok) {
        throw new Error(`Failed to select project (${selectRes.status})`);
      }
      await sleep(250);
      continue;
    }
    if (pollRes.ok && poll.status === "approved" && poll.cliSessionToken) {
      const existing = readCliConfig();
      const resolvedProjectSlug = poll.projectSlug ?? args.project ?? existing.projectSlug ?? null;
      const knownProjects = [...new Set([...(existing.knownProjects ?? []), ...(resolvedProjectSlug ? [resolvedProjectSlug] : [])])];
      const mergedKnownProjects = [...new Set([...knownProjects, ...discoveredProjectSlugs])];
      writeCliConfig({
        workerUrl: args.workerUrl,
        projectSlug: resolvedProjectSlug ?? undefined,
        knownProjects: mergedKnownProjects,
        cliSessionToken: poll.cliSessionToken,
        cliSessionExpiresAt: poll.cliSessionExpiresAt
      });
      process.stdout.write(`  Login successful. Session cached at ${configFilePath()}\n`);
      return;
    }
    throw new Error(`Login failed: ${poll.status ?? `HTTP ${pollRes.status}`}`);
  }
  throw new Error("Login timed out. Retry `relay login`.");
}
