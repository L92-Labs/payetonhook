import type { EnqueuedWebhookEvent } from "@payetonhook/shared";

export type AppBindings = {
  DB: D1Database;
  EVENT_BLOB: R2Bucket;
  WEBHOOK_QUEUE: Queue<EnqueuedWebhookEvent>;
  TUNNEL_HUB: DurableObjectNamespace;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  AUTH_REDIRECT_URI: string;
  DASHBOARD_ORIGINS: string;
  RATE_LIMIT_PER_MINUTE_PROJECT: string;
  RATE_LIMIT_PER_MINUTE_IP: string;
  ALERT_WEBHOOK_URL: string;
  ALERT_MIN_INTERVAL_MS: string;
  TUNNEL_TOKEN_SECRET: string;
  RETENTION_SWEEP_BATCH_SIZE: string;
};

export type AppEnv = {
  Bindings: AppBindings;
  Variables: {
    projectId: string;
    userId: string;
    userEmail: string;
    userName: string;
    userPicture: string;
  };
};
