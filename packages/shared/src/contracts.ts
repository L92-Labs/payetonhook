export type PlanTier = "free" | "dev" | "pro" | "enterprise";

export type ProjectRecord = {
  id: string;
  slug: string;
  name: string;
  signingSecret: string | null;
  retentionDays: number;
  planTier: PlanTier;
  shardId: string | null;
  createdAt: number;
};

export type DestinationRecord = {
  id: string;
  projectId: string;
  name: string;
  url: string;
  endpointPath: string | null;
  managedByEndpoint: boolean;
  headersJson: string | null;
  conditionExpr: string | null;
  transformCode: string | null;
  active: boolean;
  timeoutMs: number;
  maxRetries: number;
  createdAt: number;
};

export type EnqueuedWebhookEvent = {
  eventId: string;
  projectId: string;
  projectSlug: string;
  endpointPath: string;
  r2Key: string;
  headers: Record<string, string>;
  sourceIp: string | null;
  replay: boolean;
  receivedAt: number;
};

export type DeliveryStatus = "pending" | "success" | "failed" | "dead_letter";

export type ProjectVolumeMetric = {
  projectId: string;
  projectSlug: string;
  projectName: string;
  count: number;
};

export type TimeseriesPoint = {
  bucketStart: number;
  count: number;
};

export type StatusBucketMetric = {
  bucket: "http_2xx" | "http_4xx" | "http_5xx" | "timeout_or_network";
  count: number;
  percentage: number;
};

export type DetailedStatusCodeMetric = {
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

export type DeliveryHealthMetric = {
  successCount: number;
  failedCount: number;
  successRate: number;
};

export function stableShardForProject(projectId: string, shardCount: number): number {
  if (shardCount <= 0) {
    throw new Error("shardCount must be > 0");
  }
  let hash = 2166136261;
  for (let i = 0; i < projectId.length; i += 1) {
    hash ^= projectId.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0) % shardCount;
}
