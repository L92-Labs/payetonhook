export type EventRow = {
  id: string;
  project_id: string;
  project_slug: string;
  endpoint_path?: string | null;
  replay?: boolean;
  r2_key: string;
  replay_of_event_id: string | null;
  request_method?: string;
  received_at: number;
};

export type EventPageInfo = {
  nextCursor: string | null;
  hasMore: boolean;
};

export type AttemptRow = {
  id: string;
  attempt_no: number;
  status_code: number | null;
  success: number;
  error_message: string | null;
  attempted_at: number;
};

export type ProjectRow = {
  id: string;
  slug: string;
  name: string;
  retention_days: number;
  plan_tier: string;
  primary_forward_url?: string | null;
};

export type ApiKeyRow = {
  id: string;
  label: string | null;
  created_at: number;
  revoked_at: number | null;
  fingerprint: string;
};

export type ProjectEndpointRow = {
  id: string;
  project_id: string;
  name: string;
  path: string;
  forward_url: string | null;
  active: number;
  created_at: number;
  updated_at: number;
};

export type ProjectsVolumeMetric = {
  project_id: string;
  project_slug: string;
  project_name: string;
  count: number;
};

export type TimeseriesPoint = {
  bucket_start: number;
  count: number;
};

export type StatusBucketMetric = {
  bucket: "http_2xx" | "http_4xx" | "http_5xx" | "timeout_or_network";
  count: number;
  percentage: number;
};

export type DetailedStatusMetric = {
  code: string;
  count: number;
  percentage: number;
};

export type LatencyMetric = {
  p50: number;
  p95: number;
  p99: number;
  avg: number;
  max: number;
};

export type TunnelConnection = {
  id: string;
  projectSlug: string;
  workerUrl: string;
  targetUrl: string;
  deviceLabel: string | null;
  hostname: string | null;
  os: string | null;
  platform: string | null;
  nodeVersion: string | null;
  sourceIp: string | null;
  country: string | null;
  connectedAt: number;
  lastActivity: number;
  eventsForwarded: number;
  deliveriesOk: number;
  deliveriesFailed: number;
  success24h: number;
  failed24h: number;
  lastError: string | null;
  status: "live" | "idle" | "stale";
};

export type TunnelAttemptRow = {
  tunnel_id: string;
  target_url: string | null;
  device_label: string | null;
  source_ip: string | null;
  country: string | null;
  os: string | null;
  platform: string | null;
  success: number;
  status_code: number | null;
  error_message: string | null;
  duration_ms: number | null;
  attempted_at: number;
};

export type DeliveryHealthMetric = {
  successCount: number;
  failedCount: number;
  successRate: number;
};

export type OpsSummary = {
  ingressCount: number;
  rateLimitedCount: number;
  rateLimitedProject: number;
  rateLimitedIp: number;
};

export type OpsDestinationFailure = {
  destinationId: string;
  destinationName: string;
  failedCount: number;
  totalCount: number;
  failureRate: number;
};

export type DialogState =
  | { kind: "createProject" }
  | { kind: "editProject"; projectId: string; currentName: string; currentPrimaryForwardUrl: string | null }
  | { kind: "archiveProject"; projectId: string; projectName: string }
  | { kind: "createEndpoint" }
  | { kind: "editEndpoint"; endpoint: ProjectEndpointRow }
  | { kind: "deleteEndpoint"; endpoint: ProjectEndpointRow }
  | { kind: "createApiKey" };

export type DashboardView = "events" | "project";

export type ProjectSection = "overview" | "endpoints" | "access" | "monitoring" | "tunnels";
