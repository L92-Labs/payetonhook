import { Copy, Pencil, Trash2 } from "lucide-react";
import { BarChart, LineChart } from "./Charts";
import type {
  ApiKeyRow,
  DeliveryHealthMetric,
  DetailedStatusMetric,
  LatencyMetric,
  OpsDestinationFailure,
  OpsSummary,
  ProjectEndpointRow,
  ProjectRow,
  ProjectSection,
  ProjectsVolumeMetric,
  StatusBucketMetric,
  TimeseriesPoint,
  TunnelConnection
} from "./types";

type ProjectViewProps = {
  activeSection: ProjectSection;
  activeTunnelCount: number;
  countryFlag: (country: string | null) => string | null;
  dateOnly: Intl.DateTimeFormat;
  endpointBase: string;
  health: DeliveryHealthMetric;
  ingressUrl: string;
  latency: LatencyMetric;
  latestIngressText: string;
  onCopyText: (text: string, label: string) => void;
  onCreateApiKey: () => void;
  onCreateEndpoint: () => void;
  onCreateProject: () => void;
  onDeleteEndpoint: (endpoint: ProjectEndpointRow) => void;
  onDeleteProject: () => void;
  onDisconnectTunnel: (tunnelId: string) => void;
  onEditEndpoint: (endpoint: ProjectEndpointRow) => void;
  onRevokeApiKey: (keyId: string) => void;
  onRotateApiKey: (keyId: string) => void;
  onSectionChange: (section: ProjectSection) => void;
  onSelectTunnel: (tunnelId: string | null) => void;
  onToggleShowRevokedKeys: () => void;
  onUpdateProject: () => void;
  onWindowPresetChange: (value: "24h" | "7d" | "30d") => void;
  opsAlerts: Record<string, number>;
  opsRateLimitedSeries: TimeseriesPoint[];
  opsSummary: OpsSummary;
  opsTopFailures: OpsDestinationFailure[];
  projectEndpointCount: number;
  projectEndpoints: ProjectEndpointRow[];
  projectsVolume: ProjectsVolumeMetric[];
  revokedCount: number;
  selectedProject: ProjectRow | null;
  selectedTunnel: string | null;
  showRevokedKeys: boolean;
  statusBuckets: StatusBucketMetric[];
  statusDetails: DetailedStatusMetric[];
  timeAgo: (ts: number) => string;
  timeseries: TimeseriesPoint[];
  tunnels: TunnelConnection[];
  visibleKeys: ApiKeyRow[];
  windowPreset: "24h" | "7d" | "30d";
};

function truncateMiddle(value: string, lead = 40, tail = 16) {
  if (value.length <= lead + tail + 3) return value;
  return `${value.slice(0, lead)}...${value.slice(-tail)}`;
}

const PROJECT_SECTIONS: Array<{ id: ProjectSection; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "endpoints", label: "Endpoints" },
  { id: "access", label: "Access" },
  { id: "monitoring", label: "Monitoring" },
  { id: "tunnels", label: "Tunnels" }
];

export function ProjectView({
  activeSection,
  activeTunnelCount,
  countryFlag,
  dateOnly,
  endpointBase,
  health,
  ingressUrl,
  latency,
  latestIngressText,
  onCopyText,
  onCreateApiKey,
  onCreateEndpoint,
  onCreateProject,
  onDeleteEndpoint,
  onDeleteProject,
  onDisconnectTunnel,
  onEditEndpoint,
  onRevokeApiKey,
  onRotateApiKey,
  onSectionChange,
  onSelectTunnel,
  onToggleShowRevokedKeys,
  onUpdateProject,
  onWindowPresetChange,
  opsAlerts,
  opsRateLimitedSeries,
  opsSummary,
  opsTopFailures,
  projectEndpointCount,
  projectEndpoints,
  projectsVolume,
  revokedCount,
  selectedProject,
  selectedTunnel,
  showRevokedKeys,
  statusBuckets,
  statusDetails,
  timeAgo,
  timeseries,
  tunnels,
  visibleKeys,
  windowPreset
}: ProjectViewProps) {
  const renderedSection = (() => {
    switch (activeSection) {
      case "overview":
        return (
          <ProjectOverviewSection
            activeTunnelCount={activeTunnelCount}
            health={health}
            ingressUrl={ingressUrl}
            latency={latency}
            latestIngressText={latestIngressText}
            onCopyText={onCopyText}
            onCreateApiKey={onCreateApiKey}
            onCreateEndpoint={onCreateEndpoint}
            onSectionChange={onSectionChange}
            opsSummary={opsSummary}
            projectEndpointCount={projectEndpointCount}
            selectedProject={selectedProject}
            visibleKeys={visibleKeys}
          />
        );
      case "endpoints":
        return (
          <ProjectEndpointsSection
            endpointBase={endpointBase}
            ingressUrl={ingressUrl}
            onCopyText={onCopyText}
            onCreateEndpoint={onCreateEndpoint}
            onDeleteEndpoint={onDeleteEndpoint}
            onEditEndpoint={onEditEndpoint}
            projectEndpoints={projectEndpoints}
            selectedProject={selectedProject}
          />
        );
      case "access":
        return (
          <ProjectAccessSection
            dateOnly={dateOnly}
            onCopyText={onCopyText}
            onCreateApiKey={onCreateApiKey}
            onRevokeApiKey={onRevokeApiKey}
            onRotateApiKey={onRotateApiKey}
            onToggleShowRevokedKeys={onToggleShowRevokedKeys}
            revokedCount={revokedCount}
            showRevokedKeys={showRevokedKeys}
            visibleKeys={visibleKeys}
          />
        );
      case "monitoring":
        return (
          <ProjectMonitoringSection
            health={health}
            latency={latency}
            onWindowPresetChange={onWindowPresetChange}
            opsAlerts={opsAlerts}
            opsRateLimitedSeries={opsRateLimitedSeries}
            opsSummary={opsSummary}
            opsTopFailures={opsTopFailures}
            projectsVolume={projectsVolume}
            statusBuckets={statusBuckets}
            statusDetails={statusDetails}
            timeseries={timeseries}
            windowPreset={windowPreset}
          />
        );
      case "tunnels":
        return (
          <ProjectTunnelsSection
            activeTunnelCount={activeTunnelCount}
            countryFlag={countryFlag}
            onCopyText={onCopyText}
            onDisconnectTunnel={onDisconnectTunnel}
            onSelectTunnel={onSelectTunnel}
            selectedProject={selectedProject}
            selectedTunnel={selectedTunnel}
            timeAgo={timeAgo}
            tunnels={tunnels}
          />
        );
      default:
        return null;
    }
  })();

  return (
    <section className="project-workspace" id="main-workspace">
      <header className="project-shell reveal-3">
        <div className="project-shell-head">
          <div className="project-shell-copy">
            <p className="eyebrow">Project Workspace</p>
            <div className="project-title-row">
              <strong>{selectedProject?.name ?? "No project selected"}</strong>
              {selectedProject ? <span className="project-status-badge">Active</span> : null}
            </div>
            <p className="panel-subtitle">Settings, endpoints, access, monitoring, and tunnels live here.</p>
            {selectedProject ? (
              <div className="project-meta-pills compact">
                <span className="project-pill">Slug <code>{selectedProject.slug}</code></span>
                <span className="project-pill">Retention <strong>{selectedProject.retention_days}d</strong></span>
                <span className="project-pill">Latest ingress <strong>{latestIngressText}</strong></span>
              </div>
            ) : null}
          </div>
          <div className="project-shell-actions">
            <button className="ghost-btn" onClick={onCreateProject} type="button">New project</button>
            <button className="ghost-btn" onClick={onUpdateProject} type="button" disabled={!selectedProject}>Edit project</button>
            <button className="ghost-btn danger" onClick={onDeleteProject} type="button" disabled={!selectedProject}>Archive</button>
          </div>
        </div>

        <div className="project-shell-context">
          <div className="project-shell-card">
            <div className="project-shell-card-copy">
              <span className="metric-label">Ingress URL</span>
              <code title={ingressUrl}>{truncateMiddle(ingressUrl)}</code>
            </div>
            <button
              className="ghost-btn icon-btn icon-action"
              onClick={() => onCopyText(ingressUrl, "Ingress URL")}
              aria-label="Copy ingress URL"
              type="button"
            >
              <Copy aria-hidden="true" />
            </button>
          </div>
          <div className="project-shell-card">
            <div className="project-shell-card-copy">
              <span className="metric-label">Endpoints</span>
              <strong>{projectEndpointCount}</strong>
              <small>{selectedProject?.primary_forward_url ? "Project default forwarder configured" : "Primary route plus optional custom paths"}</small>
            </div>
          </div>
          <div className="project-shell-card">
            <div className="project-shell-card-copy">
              <span className="metric-label">Primary forward URL</span>
              <code title={selectedProject?.primary_forward_url ?? "No primary forward URL"}>
                {selectedProject?.primary_forward_url ? truncateMiddle(selectedProject.primary_forward_url, 30, 14) : "Not configured"}
              </code>
            </div>
          </div>
        </div>

        <div className="project-section-nav" role="tablist" aria-label="Project sections">
          {PROJECT_SECTIONS.map((section) => (
            <button
              key={section.id}
              className={`project-section-tab ${activeSection === section.id ? "active" : ""}`}
              onClick={() => onSectionChange(section.id)}
              type="button"
              role="tab"
              aria-selected={activeSection === section.id}
            >
              {section.label}
            </button>
          ))}
        </div>
      </header>

      {renderedSection}
    </section>
  );
}

function ProjectOverviewSection({
  activeTunnelCount,
  health,
  ingressUrl,
  latency,
  latestIngressText,
  onCopyText,
  onCreateApiKey,
  onCreateEndpoint,
  onSectionChange,
  opsSummary,
  projectEndpointCount,
  selectedProject,
  visibleKeys
}: {
  activeTunnelCount: number;
  health: DeliveryHealthMetric;
  ingressUrl: string;
  latency: LatencyMetric;
  latestIngressText: string;
  onCopyText: (text: string, label: string) => void;
  onCreateApiKey: () => void;
  onCreateEndpoint: () => void;
  onSectionChange: (section: ProjectSection) => void;
  opsSummary: OpsSummary;
  projectEndpointCount: number;
  selectedProject: ProjectRow | null;
  visibleKeys: ApiKeyRow[];
}) {
  return (
    <div className="project-section-stack reveal-4">
      <section className="project-utility-panel">
        <div className="panel-header">
          <div>
            <h2>Overview</h2>
            <p className="panel-subtitle">The project essentials without the dashboard sprawl.</p>
          </div>
        </div>
        <div className="project-overview-kpis">
          <div className="utility-stat-card">
            <span className="metric-label">Requests</span>
            <strong>{opsSummary.ingressCount.toLocaleString()}</strong>
            <small>{latestIngressText === "none" ? "No recent ingress" : `Latest ingress ${latestIngressText}`}</small>
          </div>
          <div className="utility-stat-card">
            <span className="metric-label">Delivery rate</span>
            <strong>{health.successRate}%</strong>
            <small>{health.successCount} success / {health.failedCount} failed</small>
          </div>
          <div className="utility-stat-card">
            <span className="metric-label">p99 latency</span>
            <strong>{latency.p99}ms</strong>
            <small>avg {latency.avg}ms · max {latency.max}ms</small>
          </div>
          <div className="utility-stat-card">
            <span className="metric-label">Live tunnels</span>
            <strong>{activeTunnelCount}</strong>
            <small>{projectEndpointCount} endpoint routes · {visibleKeys.length} visible keys</small>
          </div>
        </div>
      </section>

      <div className="project-overview-columns">
        <section className="project-utility-panel">
          <div className="panel-header">
            <div>
              <h2>Routing</h2>
              <p className="panel-subtitle">Ingress and forwarding posture for this project.</p>
            </div>
          </div>
          <div className="project-summary-list">
            <div className="project-summary-item">
              <span>Primary ingress</span>
              <button className="inline-copy inline-copy-code" onClick={() => onCopyText(ingressUrl, "Ingress URL")} type="button">
                {truncateMiddle(ingressUrl, 38, 16)}
              </button>
            </div>
            <div className="project-summary-item">
              <span>Endpoints</span>
              <strong>{projectEndpointCount}</strong>
            </div>
            <div className="project-summary-item">
              <span>Primary forward URL</span>
              <strong>{selectedProject?.primary_forward_url ? truncateMiddle(selectedProject.primary_forward_url, 28, 14) : "Not configured"}</strong>
            </div>
          </div>
        </section>

        <section className="project-utility-panel">
          <div className="panel-header">
            <div>
              <h2>Next Actions</h2>
              <p className="panel-subtitle">Fast paths to the utilities you actually use.</p>
            </div>
          </div>
          <div className="project-action-list">
            <button className="ghost-btn project-link-btn" onClick={() => onSectionChange("endpoints")} type="button">
              Manage endpoints
            </button>
            <button className="ghost-btn project-link-btn" onClick={() => onSectionChange("monitoring")} type="button">
              Review monitoring
            </button>
            <button className="ghost-btn project-link-btn" onClick={() => onSectionChange("tunnels")} type="button">
              Inspect tunnels
            </button>
            <button className="primary-btn project-link-btn" onClick={onCreateEndpoint} type="button">
              Add endpoint
            </button>
            <button className="ghost-btn project-link-btn" onClick={onCreateApiKey} type="button">
              Create API key
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}

function ProjectEndpointsSection({
  endpointBase,
  ingressUrl,
  onCopyText,
  onCreateEndpoint,
  onDeleteEndpoint,
  onEditEndpoint,
  projectEndpoints,
  selectedProject
}: {
  endpointBase: string;
  ingressUrl: string;
  onCopyText: (text: string, label: string) => void;
  onCreateEndpoint: () => void;
  onDeleteEndpoint: (endpoint: ProjectEndpointRow) => void;
  onEditEndpoint: (endpoint: ProjectEndpointRow) => void;
  projectEndpoints: ProjectEndpointRow[];
  selectedProject: ProjectRow | null;
}) {
  return (
    <section className="project-utility-panel reveal-4">
      <div className="panel-header">
        <div>
          <h2>Endpoints</h2>
          <p className="panel-subtitle">All public routes and their forwarding destinations.</p>
        </div>
        <button className="primary-btn" onClick={onCreateEndpoint} type="button">
          Add endpoint
        </button>
      </div>

      <div className="resource-table">
        <div className="resource-table-head endpoint-table-grid">
          <span>Name</span>
          <span>Path</span>
          <span>Forward URL</span>
          <span>Actions</span>
        </div>
        <div className="resource-row endpoint-table-grid">
          <div className="resource-primary">
            <strong>Primary</strong>
            <small>Default project ingress</small>
          </div>
          <code>/in/{selectedProject?.slug ?? "project"}</code>
          <code title={selectedProject?.primary_forward_url ?? "Not configured"}>
            {selectedProject?.primary_forward_url ? truncateMiddle(selectedProject.primary_forward_url, 34, 16) : "Not configured"}
          </code>
          <div className="resource-actions">
            <button className="ghost-btn icon-btn icon-action" onClick={() => onCopyText(ingressUrl, "Ingress URL")} aria-label="Copy primary endpoint" type="button">
              <Copy aria-hidden="true" />
            </button>
          </div>
        </div>
        {projectEndpoints.length ? (
          projectEndpoints.map((endpoint) => (
            <div key={endpoint.id} className="resource-row endpoint-table-grid">
              <div className="resource-primary">
                <strong>{endpoint.name}</strong>
                <small>{endpoint.active === 1 ? "Active route" : "Inactive route"}</small>
              </div>
              <code>/in/{endpoint.path}</code>
              <code title={endpoint.forward_url ?? "Not configured"}>
                {endpoint.forward_url ? truncateMiddle(endpoint.forward_url, 34, 16) : "Not configured"}
              </code>
              <div className="resource-actions">
                <button
                  className="ghost-btn icon-btn icon-action"
                  onClick={() => onCopyText(`${endpointBase}${endpoint.path}`, "Endpoint URL")}
                  aria-label={`Copy endpoint URL for ${endpoint.name}`}
                  type="button"
                >
                  <Copy aria-hidden="true" />
                </button>
                <button className="ghost-btn icon-btn icon-action" onClick={() => onEditEndpoint(endpoint)} aria-label={`Edit endpoint ${endpoint.name}`} type="button">
                  <Pencil aria-hidden="true" />
                </button>
                <button className="ghost-btn icon-btn icon-action" onClick={() => onDeleteEndpoint(endpoint)} aria-label={`Delete endpoint ${endpoint.name}`} type="button">
                  <Trash2 aria-hidden="true" />
                </button>
              </div>
            </div>
          ))
        ) : (
          <div className="resource-empty">
            <h3>No custom endpoints</h3>
            <p className="muted">The primary ingress route is active. Add custom paths when you need alternate routing or forward targets.</p>
          </div>
        )}
      </div>
    </section>
  );
}

function ProjectAccessSection({
  dateOnly,
  onCopyText,
  onCreateApiKey,
  onRevokeApiKey,
  onRotateApiKey,
  onToggleShowRevokedKeys,
  revokedCount,
  showRevokedKeys,
  visibleKeys
}: {
  dateOnly: Intl.DateTimeFormat;
  onCopyText: (text: string, label: string) => void;
  onCreateApiKey: () => void;
  onRevokeApiKey: (keyId: string) => void;
  onRotateApiKey: (keyId: string) => void;
  onToggleShowRevokedKeys: () => void;
  revokedCount: number;
  showRevokedKeys: boolean;
  visibleKeys: ApiKeyRow[];
}) {
  return (
    <section className="project-utility-panel reveal-4">
      <div className="panel-header">
        <div>
          <h2>Access</h2>
          <p className="panel-subtitle">API keys in a denser management view.</p>
        </div>
        <div className="header-inline-actions">
          {revokedCount > 0 ? (
            <button className="ghost-btn" onClick={onToggleShowRevokedKeys} type="button">
              {showRevokedKeys ? "Hide" : "Show"} revoked ({revokedCount})
            </button>
          ) : null}
          <button className="primary-btn" onClick={onCreateApiKey} type="button">
            Create key
          </button>
        </div>
      </div>

      {visibleKeys.length ? (
        <div className="resource-table">
          <div className="resource-table-head access-table-grid">
            <span>Label</span>
            <span>Status</span>
            <span>Created</span>
            <span>Fingerprint</span>
            <span>Actions</span>
          </div>
          {visibleKeys.map((key) => (
            <div key={key.id} className={`resource-row access-table-grid ${key.revoked_at ? "key-revoked" : ""}`}>
              <div className="resource-primary">
                <strong>{key.label ?? "Default"}</strong>
                <small>{key.revoked_at ? "Disabled credential" : "Active credential"}</small>
              </div>
              <span>{key.revoked_at ? "Revoked" : "Active"}</span>
              <span>{dateOnly.format(new Date(key.created_at))}</span>
              <button
                className="inline-copy inline-copy-muted table-inline-copy"
                onClick={() => onCopyText(key.fingerprint, "Fingerprint")}
                title="Copy fingerprint"
                type="button"
              >
                fp:{key.fingerprint.slice(0, 14)}...
              </button>
              <div className="resource-actions">
                <button
                  className="ghost-btn icon-btn icon-action"
                  onClick={() => onCopyText(key.fingerprint, "Fingerprint")}
                  aria-label={`Copy fingerprint for ${key.label ?? "Default"}`}
                  type="button"
                >
                  <Copy aria-hidden="true" />
                </button>
                <button className="ghost-btn" onClick={() => onRotateApiKey(key.id)} disabled={!!key.revoked_at} type="button">
                  Rotate
                </button>
                <button className="ghost-btn" onClick={() => onRevokeApiKey(key.id)} disabled={!!key.revoked_at} type="button">
                  Revoke
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="resource-empty">
          <h3>No active keys</h3>
          <p className="muted">Create a scoped key for local scripts, CI hooks, or one-off tooling.</p>
          <button className="primary-btn" onClick={onCreateApiKey} type="button">
            Create key
          </button>
        </div>
      )}
    </section>
  );
}

function ProjectMonitoringSection({
  health,
  latency,
  onWindowPresetChange,
  opsAlerts,
  opsRateLimitedSeries,
  opsSummary,
  opsTopFailures,
  projectsVolume,
  statusBuckets,
  statusDetails,
  timeseries,
  windowPreset
}: {
  health: DeliveryHealthMetric;
  latency: LatencyMetric;
  onWindowPresetChange: (value: "24h" | "7d" | "30d") => void;
  opsAlerts: Record<string, number>;
  opsRateLimitedSeries: TimeseriesPoint[];
  opsSummary: OpsSummary;
  opsTopFailures: OpsDestinationFailure[];
  projectsVolume: ProjectsVolumeMetric[];
  statusBuckets: StatusBucketMetric[];
  statusDetails: DetailedStatusMetric[];
  timeseries: TimeseriesPoint[];
  windowPreset: "24h" | "7d" | "30d";
}) {
  return (
    <div className="project-section-stack reveal-4">
      <section className="project-utility-panel">
        <div className="panel-header">
          <div>
            <h2>Delivery Health</h2>
            <p className="panel-subtitle">Core health and response quality for the current window.</p>
          </div>
        </div>
        <div className="monitoring-summary-grid">
          <div className="utility-stat-card">
            <span className="metric-label">Success</span>
            <strong>{health.successCount}</strong>
          </div>
          <div className="utility-stat-card">
            <span className="metric-label">Failed</span>
            <strong>{health.failedCount}</strong>
          </div>
          <div className="utility-stat-card">
            <span className="metric-label">Rate</span>
            <strong>{health.successRate}%</strong>
          </div>
        </div>
        <div className="project-overview-columns">
          <article className="metric-card utility-card">
            <h3>Status Distribution</h3>
            <ul className="status-list">
              {statusBuckets.length ? (
                statusBuckets.map((bucket) => (
                  <li key={bucket.bucket}>
                    <span>{bucket.bucket}</span>
                    <strong>{bucket.count}</strong>
                    <small>{bucket.percentage}%</small>
                  </li>
                ))
              ) : (
                <li>
                  <span>No delivery status yet</span>
                  <strong>0</strong>
                  <small>0%</small>
                </li>
              )}
            </ul>
          </article>
          <article className="metric-card utility-card">
            <h3>Detailed HTTP Codes</h3>
            <ul className="status-list">
              {statusDetails.length ? (
                statusDetails.slice(0, 8).map((row) => (
                  <li key={row.code}>
                    <span>{row.code}</span>
                    <strong>{row.count}</strong>
                    <small>{row.percentage}%</small>
                  </li>
                ))
              ) : (
                <li>
                  <span>No response codes yet</span>
                  <strong>0</strong>
                  <small>0%</small>
                </li>
              )}
            </ul>
          </article>
        </div>
      </section>

      <section className="project-utility-panel">
        <div className="panel-header">
          <div>
            <h2>Traffic and Latency</h2>
            <p className="panel-subtitle">Volume, trend, and latency grouped in one scan path.</p>
          </div>
          <div className="seg-control">
            {(["24h", "7d", "30d"] as const).map((window) => (
              <button
                key={window}
                className={`seg-btn ${windowPreset === window ? "active" : ""}`}
                onClick={() => onWindowPresetChange(window)}
                type="button"
              >
                {window}
              </button>
            ))}
          </div>
        </div>
        <div className="project-overview-columns monitoring-columns">
          <article className="metric-card utility-card">
            <h3>Requests Per Project</h3>
            {projectsVolume.length ? (
              <BarChart
                data={projectsVolume.map((metric) => ({ label: metric.project_name, value: Number(metric.count) }))}
                maxValue={Math.max(1, ...projectsVolume.map((metric) => Number(metric.count)))}
              />
            ) : (
              <div className="utility-empty small">
                <p className="muted">No project traffic yet.</p>
              </div>
            )}
          </article>
          <article className="metric-card utility-card">
            <h3>Request Trend</h3>
            <LineChart points={timeseries} ariaLabel="Request trend" />
          </article>
        </div>
        <article className="metric-card utility-card">
          <h3>Latency (ms)</h3>
          <div className="latency-grid">
            <p><span>p50</span><strong>{latency.p50}</strong></p>
            <p><span>p95</span><strong>{latency.p95}</strong></p>
            <p><span>p99</span><strong>{latency.p99}</strong></p>
            <p><span>avg</span><strong>{latency.avg}</strong></p>
            <p><span>max</span><strong>{latency.max}</strong></p>
          </div>
        </article>
      </section>

      <section className="project-utility-panel">
        <div className="panel-header">
          <div>
            <h2>Rate Limits and Failures</h2>
            <p className="panel-subtitle">Signals that need investigation or capacity tuning.</p>
          </div>
        </div>
        <div className="project-overview-columns monitoring-columns">
          <article className="metric-card utility-card">
            <h3>Ingress vs Throttled</h3>
            <div className="latency-grid">
              <p><span>Ingress</span><strong>{opsSummary.ingressCount}</strong></p>
              <p><span>Rate limited</span><strong>{opsSummary.rateLimitedCount}</strong></p>
              <p><span>Project 429s</span><strong>{opsSummary.rateLimitedProject}</strong></p>
              <p><span>IP 429s</span><strong>{opsSummary.rateLimitedIp}</strong></p>
            </div>
          </article>
          <article className="metric-card utility-card">
            <h3>Rate-limit Timeline</h3>
            <LineChart points={opsRateLimitedSeries} ariaLabel="Rate-limit timeline" />
          </article>
        </div>
        <div className="project-overview-columns monitoring-columns">
          <article className="metric-card utility-card">
            <h3>Alert Counters</h3>
            <ul className="status-list">
              {Object.entries(opsAlerts).length ? (
                Object.entries(opsAlerts).map(([name, count]) => (
                  <li key={name}>
                    <span>{name}</span>
                    <strong>{count}</strong>
                    <small>signals</small>
                  </li>
                ))
              ) : (
                <li>
                  <span>No alerts</span>
                  <strong>0</strong>
                  <small>signals</small>
                </li>
              )}
            </ul>
          </article>
          <article className="metric-card utility-card">
            <h3>Top Failing Destinations</h3>
            <ul className="status-list">
              {opsTopFailures.length ? (
                opsTopFailures.map((item) => (
                  <li key={item.destinationId}>
                    <span>{item.destinationName}</span>
                    <strong>{item.failedCount}/{item.totalCount}</strong>
                    <small>{item.failureRate}%</small>
                  </li>
                ))
              ) : (
                <li>
                  <span>No failing destinations</span>
                  <strong>0</strong>
                  <small>healthy</small>
                </li>
              )}
            </ul>
          </article>
        </div>
      </section>
    </div>
  );
}

function ProjectTunnelsSection({
  activeTunnelCount,
  countryFlag,
  onCopyText,
  onDisconnectTunnel,
  onSelectTunnel,
  selectedProject,
  selectedTunnel,
  timeAgo,
  tunnels
}: {
  activeTunnelCount: number;
  countryFlag: (country: string | null) => string | null;
  onCopyText: (text: string, label: string) => void;
  onDisconnectTunnel: (tunnelId: string) => void;
  onSelectTunnel: (tunnelId: string | null) => void;
  selectedProject: ProjectRow | null;
  selectedTunnel: string | null;
  timeAgo: (ts: number) => string;
  tunnels: TunnelConnection[];
}) {
  return (
    <section className="project-utility-panel tunnel-panel reveal-4">
      <div className="panel-header">
        <div className="tunnel-title-group">
          <h2>Tunnel Connections</h2>
          <span className="tunnel-subtitle">Local dev → Production webhooks</span>
          <span className="tunnel-subtitle">Scoped to: <code>{selectedProject?.slug ?? "no-project"}</code></span>
        </div>
        <div className="tunnel-status-badge">
          <span className="tunnel-pulse" />
          <span>{activeTunnelCount} live · {tunnels.length} connected</span>
        </div>
      </div>

      {tunnels.length > 0 ? (
        <div className="tunnel-grid">
          {tunnels.map((tunnel, index) => (
            <div
              key={tunnel.id}
              className={`tunnel-card ${selectedTunnel === tunnel.id ? "active" : ""} ${tunnel.status}`}
              onClick={() => onSelectTunnel(selectedTunnel === tunnel.id ? null : tunnel.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelectTunnel(selectedTunnel === tunnel.id ? null : tunnel.id);
                }
              }}
              role="button"
              tabIndex={0}
              aria-expanded={selectedTunnel === tunnel.id}
            >
              <div className="tunnel-card-header">
                <div className="tunnel-connection-flow">
                  <div className="flow-node local">
                    <span className="flow-label">LOCAL</span>
                    <code>{tunnel.targetUrl.replace(/^https?:\/\//, "").split("/")[0]}</code>
                  </div>
                  <div className="flow-line">
                    <div className="flow-packet" style={{ animationDelay: `${index * 0.3}s` }} />
                  </div>
                  <div className="flow-node cloud">
                    <span className="flow-label">CLOUD</span>
                    <code>{tunnel.projectSlug}</code>
                  </div>
                </div>
                <div className={`tunnel-status-indicator ${tunnel.status}`}>
                  <span className="status-dot" />
                  <span className="status-text">{tunnel.status}</span>
                </div>
              </div>

              <div className="tunnel-metrics">
                <div className="tunnel-metric">
                  <span className="metric-value">{tunnel.eventsForwarded}</span>
                  <span className="metric-label">Forwarded</span>
                </div>
                <div className="tunnel-metric">
                  <span className="metric-value">{tunnel.deliveriesOk}</span>
                  <span className="metric-label">Delivered</span>
                </div>
                <div className="tunnel-metric">
                  <span className="metric-value">{tunnel.deliveriesFailed}</span>
                  <span className="metric-label">Failed</span>
                </div>
                <div className="tunnel-metric">
                  <span className="metric-value">{timeAgo(tunnel.connectedAt)}</span>
                  <span className="metric-label">Uptime</span>
                </div>
                <div className="tunnel-metric">
                  <span className="metric-value">{timeAgo(tunnel.lastActivity)}</span>
                  <span className="metric-label">Last Event</span>
                </div>
              </div>

              {selectedTunnel === tunnel.id ? (
                <div className="tunnel-details">
                  <div className="tunnel-detail-row">
                    <span>Device</span>
                    <code>{tunnel.deviceLabel || tunnel.hostname || "unknown"}</code>
                  </div>
                  <div className="tunnel-detail-row">
                    <span>OS / Platform</span>
                    <code>{[tunnel.os, tunnel.platform].filter(Boolean).join(" / ") || "unknown"}</code>
                  </div>
                  <div className="tunnel-detail-row">
                    <span>Source</span>
                    <code>
                      {[tunnel.sourceIp, tunnel.country ? `${countryFlag(tunnel.country) ?? ""} ${tunnel.country}`.trim() : null]
                        .filter(Boolean)
                        .join(" · ") || "unknown"}
                    </code>
                  </div>
                  <div className="tunnel-detail-row">
                    <span>Tunnel ID</span>
                    <button
                      className="inline-copy inline-copy-code"
                      onClick={(event) => { event.stopPropagation(); onCopyText(tunnel.id, "Tunnel ID"); }}
                      type="button"
                    >
                      {tunnel.id.slice(0, 20)}...
                    </button>
                  </div>
                  <div className="tunnel-detail-row">
                    <span>Target URL</span>
                    <code>{tunnel.targetUrl}</code>
                  </div>
                  <div className="tunnel-detail-row">
                    <span>Worker URL</span>
                    <code>{tunnel.workerUrl}</code>
                  </div>
                  <div className="tunnel-detail-row">
                    <span>24h Stats</span>
                    <code>{tunnel.success24h} ok / {tunnel.failed24h} fail</code>
                  </div>
                  {tunnel.lastError ? (
                    <div className="tunnel-detail-row">
                      <span>Last error</span>
                      <code>{tunnel.lastError}</code>
                    </div>
                  ) : null}
                  <div className="tunnel-actions">
                    <button
                      className="ghost-btn danger"
                      onClick={(event) => { event.stopPropagation(); onDisconnectTunnel(tunnel.id); }}
                      type="button"
                    >
                      Disconnect
                    </button>
                    <button
                      className="ghost-btn"
                      onClick={(event) => { event.stopPropagation(); onCopyText(tunnel.id, "Tunnel ID"); }}
                      type="button"
                    >
                      Copy ID
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <div className="tunnel-empty tunnel-empty-dense">
          <div className="tunnel-empty-visual">
            <div className="empty-flow">
              <div className="empty-node">CLI</div>
              <div className="empty-line" />
              <div className="empty-node">Cloud</div>
            </div>
          </div>
          <h3>No Active Tunnels</h3>
          <p>Start a tunnel from your terminal to forward production webhooks to your local development server.</p>
          <code className="tunnel-cli-hint">
            <span className="cli-prompt">$</span> relay tunnel --project my-project --to http://localhost:3000/webhook
          </code>
        </div>
      )}
    </section>
  );
}
