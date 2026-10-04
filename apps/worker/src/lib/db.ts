import type { DestinationRecord, ProjectRecord } from "@payetonhook/shared";

export type Env = {
  DB: D1Database;
};

export type EventInsert = {
  id: string;
  projectId: string;
  projectSlug: string;
  endpointPath: string | null;
  r2Key: string;
  idempotencyKey: string;
  requestMethod: string;
  requestQueryJson: string | null;
  requestHeadersJson: string;
  sourceIp: string | null;
  replayOfEventId: string | null;
  receivedAt: number;
  expiresAt: number;
};

export type DeliveryAttemptInsert = {
  id: string;
  eventId: string;
  destinationId: string;
  attemptNo: number;
  statusCode: number | null;
  success: boolean;
  responseBodyKey: string | null;
  errorMessage: string | null;
  attemptedAt: number;
  durationMs: number | null;
};

export interface ProjectsRepo {
  findBySlug(slug: string): Promise<ProjectRecord | null>;
}

export interface DestinationsRepo {
  activeForProjectEndpoint(projectId: string, endpointPath: string): Promise<DestinationRecord[]>;
}

export interface EventsRepo {
  insertOrIgnore(input: EventInsert): Promise<boolean>;
  findById(eventId: string): Promise<{
    id: string;
    project_id: string;
    project_slug: string;
    endpoint_path: string | null;
    idempotency_key: string;
    r2_key: string;
    request_method: string;
    request_query_json: string | null;
  } | null>;
  listByProject(
    projectId: string,
    limit: number,
    before?: { receivedAt: number; id: string }
  ): Promise<Array<Record<string, unknown>>>;
}

export interface AttemptsRepo {
  insert(input: DeliveryAttemptInsert): Promise<void>;
  listForEvent(projectId: string, eventId: string): Promise<Array<Record<string, unknown>>>;
}

export interface ReplaysRepo {
  insert(eventId: string, projectId: string): Promise<void>;
}

export type RepositoryBundle = {
  projects: ProjectsRepo;
  destinations: DestinationsRepo;
  events: EventsRepo;
  attempts: AttemptsRepo;
  replays: ReplaysRepo;
};

function parseProjectRow(row: Record<string, unknown>): ProjectRecord {
  return {
    id: String(row.id),
    slug: String(row.slug),
    name: String(row.name),
    signingSecret: row.signing_secret === null ? null : String(row.signing_secret),
    retentionDays: Number(row.retention_days),
    planTier: String(row.plan_tier) as ProjectRecord["planTier"],
    shardId: row.shard_id === null ? null : String(row.shard_id),
    createdAt: Number(row.created_at)
  };
}

function parseDestinationRow(row: Record<string, unknown>): DestinationRecord {
  return {
    id: String(row.id),
    projectId: String(row.project_id),
    name: String(row.name),
    url: String(row.url),
    endpointPath: row.endpoint_path === null ? null : String(row.endpoint_path),
    managedByEndpoint: Number(row.managed_by_endpoint ?? 0) === 1,
    headersJson: row.headers_json === null ? null : String(row.headers_json),
    conditionExpr: row.condition_expr === null ? null : String(row.condition_expr),
    transformCode: row.transform_code === null ? null : String(row.transform_code),
    active: Number(row.active) === 1,
    timeoutMs: Number(row.timeout_ms),
    maxRetries: Number(row.max_retries),
    createdAt: Number(row.created_at)
  };
}

export class D1Repositories implements RepositoryBundle {
  public readonly projects: ProjectsRepo;
  public readonly destinations: DestinationsRepo;
  public readonly events: EventsRepo;
  public readonly attempts: AttemptsRepo;
  public readonly replays: ReplaysRepo;

  constructor(private readonly env: Env) {
    this.projects = {
      findBySlug: async (slug: string) => {
        const row = await this.env.DB.prepare("SELECT * FROM projects WHERE slug = ? AND archived_at IS NULL LIMIT 1").bind(slug).first<Record<string, unknown>>();
        return row ? parseProjectRow(row) : null;
      }
    };

    this.destinations = {
      activeForProjectEndpoint: async (projectId: string, endpointPath: string) => {
        const rows = await this.env.DB.prepare(
          `SELECT *
           FROM destinations
           WHERE project_id = ?
             AND active = 1
             AND (managed_by_endpoint = 0 OR endpoint_path = ?)
           ORDER BY created_at ASC`
        ).bind(projectId, endpointPath).all<Record<string, unknown>>();
        return (rows.results ?? []).map(parseDestinationRow);
      }
    };

    this.events = {
      insertOrIgnore: async (input: EventInsert) => {
        const result = await this.env.DB.prepare(
          `INSERT OR IGNORE INTO events
           (id, project_id, project_slug, endpoint_path, r2_key, idempotency_key, request_method, request_query_json, request_headers_json, source_ip, replay_of_event_id, received_at, expires_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
          .bind(
            input.id,
            input.projectId,
            input.projectSlug,
            input.endpointPath,
            input.r2Key,
            input.idempotencyKey,
            input.requestMethod,
            input.requestQueryJson,
            input.requestHeadersJson,
            input.sourceIp,
            input.replayOfEventId,
            input.receivedAt,
            input.expiresAt
          )
          .run();
        return Boolean(result.success && result.meta.changes > 0);
      },
      findById: async (eventId: string) => {
        return this.env.DB.prepare(
          "SELECT id, project_id, project_slug, endpoint_path, idempotency_key, r2_key, request_method, request_query_json FROM events WHERE id = ? LIMIT 1"
        )
          .bind(eventId)
          .first<{
            id: string;
            project_id: string;
            project_slug: string;
            endpoint_path: string | null;
            idempotency_key: string;
            r2_key: string;
            request_method: string;
            request_query_json: string | null;
          }>();
      },
      listByProject: async (projectId: string, limit: number, before?: { receivedAt: number; id: string }) => {
        const rows = before
          ? await this.env.DB.prepare(
              `SELECT id, project_id, project_slug, endpoint_path, idempotency_key, r2_key, replay_of_event_id, request_method, received_at
               FROM events
               WHERE project_id = ?
                 AND (received_at < ? OR (received_at = ? AND id < ?))
               ORDER BY received_at DESC, id DESC
               LIMIT ?`
            )
              .bind(projectId, before.receivedAt, before.receivedAt, before.id, limit)
              .all<Record<string, unknown>>()
          : await this.env.DB.prepare(
              `SELECT id, project_id, project_slug, endpoint_path, idempotency_key, r2_key, replay_of_event_id, request_method, received_at
               FROM events
               WHERE project_id = ?
               ORDER BY received_at DESC, id DESC
               LIMIT ?`
            )
              .bind(projectId, limit)
              .all<Record<string, unknown>>();
        return rows.results ?? [];
      }
    };

    this.attempts = {
      insert: async (input: DeliveryAttemptInsert) => {
        await this.env.DB.prepare(
          `INSERT INTO delivery_attempts
           (id, event_id, destination_id, attempt_no, status_code, success, response_body_key, error_message, attempted_at, duration_ms)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
          .bind(
            input.id,
            input.eventId,
            input.destinationId,
            input.attemptNo,
            input.statusCode,
            input.success ? 1 : 0,
            input.responseBodyKey,
            input.errorMessage,
            input.attemptedAt,
            input.durationMs
          )
          .run();
      },
      listForEvent: async (projectId: string, eventId: string) => {
        const rows = await this.env.DB.prepare(
          `SELECT a.*
           FROM delivery_attempts a
           INNER JOIN events e ON e.id = a.event_id
           WHERE a.event_id = ? AND e.project_id = ?
           ORDER BY a.attempt_no ASC`
        ).bind(eventId, projectId).all<Record<string, unknown>>();
        return rows.results ?? [];
      }
    };

    this.replays = {
      insert: async (eventId: string, projectId: string) => {
        await this.env.DB.prepare(
          "INSERT INTO replays (id, event_id, project_id, created_at) VALUES (?, ?, ?, ?)"
        ).bind(crypto.randomUUID(), eventId, projectId, Date.now()).run();
      }
    };
  }
}
