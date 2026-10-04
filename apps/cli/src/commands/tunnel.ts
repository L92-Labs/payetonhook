import { randomUUID } from "node:crypto";
import os from "node:os";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { readCliConfig } from "../lib/config.js";

const DEFAULT_WORKER_URL = "https://payetonhook-worker.loiu92.workers.dev";

type TunnelArgs = {
  workerUrl: string;
  project: string;
  endpointPath: string;
  to: string;
  deviceLabel: string | null;
  apiKey: string | null;
  cliSessionToken: string | null;
  tunnelToken: string | null;
};

async function chooseProjectInteractively(projects: string[]): Promise<string> {
  const rl = createInterface({ input, output });
  try {
    process.stdout.write(`\nSelect project for tunnel:\n`);
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

async function fetchProjectsFromSession(
  workerUrl: string,
  cliSessionToken: string
): Promise<Array<{ id: string; slug: string; name: string }>> {
  const base = workerUrl.replace(/\/$/, "");
  const response = await fetch(`${base}/api/cli/session/projects`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-cli-session-token": cliSessionToken
    },
    body: "{}"
  });
  if (!response.ok) return [];
  const body = (await response.json()) as { projects?: Array<{ id: string; slug: string; name: string }> };
  return body.projects ?? [];
}

function normalizeEndpointPath(input: string): string {
  const cleaned = input.trim().replace(/^\/in\//, "").replace(/^\//, "");
  return cleaned.toLowerCase();
}

async function fetchEndpointsFromSession(
  workerUrl: string,
  cliSessionToken: string,
  projectSlug: string
): Promise<{ primaryPath: string; endpoints: Array<{ id: string; name: string; path: string; active: number }> } | null> {
  const base = workerUrl.replace(/\/$/, "");
  const response = await fetch(`${base}/api/cli/session/endpoints`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-cli-session-token": cliSessionToken
    },
    body: JSON.stringify({ projectSlug })
  });
  if (!response.ok) return null;
  const body = (await response.json()) as {
    primaryPath: string;
    endpoints?: Array<{ id: string; name: string; path: string; active: number }>;
  };
  return { primaryPath: body.primaryPath, endpoints: body.endpoints ?? [] };
}

async function createTempEndpointFromSession(
  workerUrl: string,
  cliSessionToken: string,
  projectSlug: string
): Promise<string | null> {
  const base = workerUrl.replace(/\/$/, "");
  const response = await fetch(`${base}/api/cli/session/endpoints/temp`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-cli-session-token": cliSessionToken
    },
    body: JSON.stringify({ projectSlug })
  });
  if (!response.ok) return null;
  const body = (await response.json()) as { endpoint?: { path?: string } };
  return body.endpoint?.path ?? null;
}

async function chooseEndpointInteractively(
  projectSlug: string,
  endpoints: Array<{ name: string; path: string }>
): Promise<number> {
  const rl = createInterface({ input, output });
  try {
    process.stdout.write(`\nSelect endpoint for tunnel (${projectSlug}):\n`);
    process.stdout.write(`  1) primary /in/${projectSlug}\n`);
    endpoints.forEach((endpoint, index) => {
      process.stdout.write(`  ${index + 2}) ${endpoint.name} /in/${endpoint.path}\n`);
    });
    process.stdout.write(`  0) Create temporary endpoint\n\n`);
    const answer = await rl.question("Endpoint number: ");
    const idx = Number.parseInt(answer.trim(), 10);
    if (Number.isFinite(idx)) return idx;
    return -1;
  } finally {
    rl.close();
  }
}

async function parseArgs(argv: string[]): Promise<TunnelArgs> {
  const map = new Map<string, string>();
  let tempEndpoint = false;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--temp-endpoint") {
      tempEndpoint = true;
      continue;
    }
    if (arg.startsWith("--")) {
      const value = argv[i + 1];
      if (value && !value.startsWith("--")) {
        map.set(arg, value);
        i += 1;
      }
    }
  }

  const cfg = readCliConfig();
  const workerUrl =
    map.get("--worker-url") ??
    process.env.PAYETONHOOK_WORKER_URL ??
    cfg.workerUrl ??
    DEFAULT_WORKER_URL;
  const cliSessionToken =
    cfg.cliSessionToken && (cfg.cliSessionExpiresAt ?? 0) > Date.now()
      ? cfg.cliSessionToken
      : null;
  const explicitEndpoint = map.get("--endpoint") ?? null;
  if (explicitEndpoint && tempEndpoint) {
    throw new Error("Use either --endpoint <path> or --temp-endpoint, not both.");
  }
  const explicitProject = map.get("--project") ?? process.env.PAYETONHOOK_PROJECT ?? null;
  const discoveredProjects = cliSessionToken ? await fetchProjectsFromSession(workerUrl, cliSessionToken) : [];
  const discoveredProjectSlugs = discoveredProjects.map((project) => project.slug);
  const knownProjects = [...new Set([...(discoveredProjectSlugs ?? []), ...(cfg.knownProjects ?? []), ...(cfg.projectSlug ? [cfg.projectSlug] : [])])];
  let project = explicitProject;
  if (!project) {
    if (knownProjects.length > 0) {
      project = await chooseProjectInteractively(knownProjects);
    } else {
      throw new Error(
        "No known projects. Run `relay login` first, or pass --project <slug>."
      );
    }
  }
  const to = map.get("--to");
  const hostname = os.hostname();
  const deviceLabel = map.get("--device-label")?.trim() || hostname;
  const apiKey = map.get("--api-key") ?? process.env.PAYETONHOOK_API_KEY ?? null;
  const explicitTunnelToken = map.get("--tunnel-token") ?? process.env.PAYETONHOOK_TUNNEL_TOKEN ?? null;
  const tunnelToken = explicitTunnelToken ?? null;
  const sessionTokenToUse = apiKey || explicitTunnelToken ? null : cliSessionToken;
  let endpointPath = explicitEndpoint ? normalizeEndpointPath(explicitEndpoint) : project;
  if (!explicitEndpoint && sessionTokenToUse) {
    const endpointData = await fetchEndpointsFromSession(workerUrl, sessionTokenToUse, project);
    if (endpointData) {
      const activeEndpoints = endpointData.endpoints.filter((endpoint) => Number(endpoint.active) === 1);
      if (tempEndpoint) {
        const tempPath = await createTempEndpointFromSession(workerUrl, sessionTokenToUse, project);
        if (!tempPath) throw new Error("Failed to create temporary endpoint.");
        endpointPath = tempPath;
      } else {
        const choice = await chooseEndpointInteractively(project, activeEndpoints.map((endpoint) => ({ name: endpoint.name, path: endpoint.path })));
        if (choice === 1) {
          endpointPath = project;
        } else if (choice === 0) {
          const tempPath = await createTempEndpointFromSession(workerUrl, sessionTokenToUse, project);
          if (!tempPath) throw new Error("Failed to create temporary endpoint.");
          endpointPath = tempPath;
        } else if (choice >= 2 && choice <= activeEndpoints.length + 1) {
          endpointPath = activeEndpoints[choice - 2].path;
        } else {
          throw new Error("Invalid endpoint selection.");
        }
      }
    }
  }
  if (!workerUrl || !project || !to) {
    throw new Error(
      "Usage: relay tunnel --to <local-url> [--worker-url <url>] [--project <slug>] [--endpoint <path> | --temp-endpoint] [--device-label <name>] [--api-key <key> | --tunnel-token <token>]"
    );
  }
  if (!apiKey && !tunnelToken && !sessionTokenToUse) {
    throw new Error("Tunnel auth required: run `relay login`, or provide --api-key / --tunnel-token.");
  }
  if (tempEndpoint && !sessionTokenToUse) {
    throw new Error("--temp-endpoint requires a valid CLI session from `relay login`.");
  }
  return { workerUrl, project, endpointPath, to, deviceLabel, apiKey, cliSessionToken: sessionTokenToUse, tunnelToken };
}

function authHeaders(args: TunnelArgs): Record<string, string> {
  if (args.apiKey) return { "x-api-key": args.apiKey };
  if (args.cliSessionToken) return { "x-cli-session-token": args.cliSessionToken };
  if (args.tunnelToken) return { "x-tunnel-token": args.tunnelToken };
  return {};
}

function logLine(message: string): void {
  const time = new Date().toISOString();
  process.stdout.write(`[${time}] ${message}\n`);
}

export async function runTunnel(rawArgs: string[]): Promise<void> {
  const args = await parseArgs(rawArgs);
  const tunnelId = randomUUID();
  const base = args.workerUrl.replace(/\/$/, "");
  const registerUrl = `${base}/tunnel/register`;

  const response = await fetch(registerUrl, {
    method: "POST",
    headers: { "content-type": "application/json", ...authHeaders(args) },
    body: JSON.stringify({
      id: tunnelId,
      projectSlug: args.project,
      endpointPath: args.endpointPath,
      workerUrl: args.workerUrl,
      targetUrl: args.to,
      deviceLabel: args.deviceLabel,
      hostname: os.hostname(),
      os: os.type(),
      platform: process.platform,
      nodeVersion: process.version
    })
  });

  if (!response.ok) {
    throw new Error(`Failed to register tunnel: ${response.status}`);
  }

  process.stdout.write(`\n`);
  process.stdout.write(`  ◈ Tunnel established\n`);
  process.stdout.write(`  ├─ Project: ${args.project}\n`);
  process.stdout.write(`  ├─ Source:  ${base}/in/${args.endpointPath}\n`);
  process.stdout.write(`  └─ Target:  ${args.to}\n`);
  process.stdout.write(`\n  Tunnel ID: ${tunnelId}\n`);
  process.stdout.write(`\n  Press Ctrl+C to disconnect\n\n`);

  let stopped = false;
  const unregister = async () => {
    stopped = true;
    await fetch(`${base}/tunnel/unregister`, {
      method: "POST",
      headers: { "content-type": "application/json", ...authHeaders(args) },
      body: JSON.stringify({ id: tunnelId })
    }).catch(() => undefined);
  };

  process.on("SIGINT", unregister);

  let lastPullStatus: number | null = null;
  while (!stopped) {
    const pull = await fetch(`${base}/tunnel/pull/${encodeURIComponent(tunnelId)}`, {
      headers: authHeaders(args)
    }).catch(() => null);
    if (!pull) {
      if (lastPullStatus !== -1) {
        logLine("Tunnel pull failed (network error). Retrying...");
        lastPullStatus = -1;
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
      continue;
    }
    if (!pull.ok) {
      if (lastPullStatus !== pull.status) {
        logLine(`Tunnel pull rejected (${pull.status}). Check token/API key validity.`);
        lastPullStatus = pull.status;
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
      continue;
    }
    lastPullStatus = null;
    if (pull.ok) {
      const body = (await pull.json()) as {
        events: Array<{ id: string; sourceEventId: string; payload: string; headers: Record<string, string> }>;
      };
      for (const event of body.events) {
        const startedAt = Date.now();
        let ok = false;
        let statusCode: number | null = null;
        let error: string | null = null;
        try {
          const upstream = await fetch(args.to, {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "x-webhook-tunnel": "1",
              "x-webhook-tunnel-id": tunnelId,
              ...event.headers
            },
            body: event.payload
          });
          ok = upstream.ok;
          statusCode = upstream.status;
          if (!upstream.ok) {
            error = `local target non-2xx: ${upstream.status}`;
          }
        } catch (err) {
          ok = false;
          error = err instanceof Error ? err.message : "local target request failed";
        }

        await fetch(`${base}/tunnel/report`, {
          method: "POST",
          headers: { "content-type": "application/json", ...authHeaders(args) },
          body: JSON.stringify({
            id: tunnelId,
            eventId: event.sourceEventId,
            ok,
            statusCode,
            error,
            durationMs: Date.now() - startedAt
          })
        }).catch(() => undefined);
        const ms = Date.now() - startedAt;
        if (ok) {
          logLine(`Forwarded event ${event.sourceEventId.slice(0, 8)}… -> ${statusCode ?? 200} in ${ms}ms`);
        } else {
          logLine(`Forward FAILED ${event.sourceEventId.slice(0, 8)}… (${error ?? "unknown"})`);
        }
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}
