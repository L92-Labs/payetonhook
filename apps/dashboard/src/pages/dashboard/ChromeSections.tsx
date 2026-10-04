import { Copy } from "lucide-react";
import type { ChangeEvent } from "react";
import type { DashboardView, DialogState, ProjectEndpointRow, ProjectRow } from "./types";

type HeroToolbarProps = {
  activeView: DashboardView;
  isPending: boolean;
  meName: string;
  onActiveViewChange: (view: DashboardView) => void;
  onLogout: () => void;
  onProjectSelect: (event: ChangeEvent<HTMLSelectElement>) => void;
  projects: ProjectRow[];
  selectedProjectSlug: string | null;
};

export function HeroToolbar({
  activeView,
  isPending,
  meName,
  onActiveViewChange,
  onLogout,
  onProjectSelect,
  projects,
  selectedProjectSlug
}: HeroToolbarProps) {
  return (
    <section className="workspace-toolbar reveal-1">
      <div className="workspace-toolbar-main compact">
        <div className="top-navbar-brand">
          <p className="eyebrow">Webhook Console</p>
          <strong>Payetonhook</strong>
        </div>

        <div className="toolbar-group toolbar-group-project">
          <label className="field-label field-label-inline">
            <span>Project</span>
            <select
              className="project-select project-select-compact"
              value={selectedProjectSlug ?? ""}
              onChange={onProjectSelect}
              aria-label="Select project"
            >
              {projects.map((project) => (
                <option key={project.id} value={project.slug}>
                  {project.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="nav-tabs" role="tablist" aria-label="Dashboard views">
          <button
            className={`nav-tab ${activeView === "events" ? "active" : ""}`}
            onClick={() => onActiveViewChange("events")}
            type="button"
            role="tab"
            aria-selected={activeView === "events"}
          >
            Events
          </button>
          <button
            className={`nav-tab ${activeView === "dead-letters" ? "active" : ""}`}
            onClick={() => onActiveViewChange("dead-letters")}
            type="button"
            role="tab"
            aria-selected={activeView === "dead-letters"}
          >
            Dead letters
          </button>
          <button
            className={`nav-tab ${activeView === "project" ? "active" : ""}`}
            onClick={() => onActiveViewChange("project")}
            type="button"
            role="tab"
            aria-selected={activeView === "project"}
          >
            Project
          </button>
        </div>

        <div className="toolbar-group toolbar-group-end compact">
          <span className="navbar-user">{meName}</span>
          <button className="ghost-btn ghost-btn-small" onClick={onLogout} type="button">Logout</button>
        </div>
      </div>

      <div className="workspace-toolbar-note">
        {isPending ? (
          <span className="muted">Updating project context…</span>
        ) : activeView === "events" ? (
          <span className="muted">Events stays primary. Use `/`, `J/K`, and `R` for fast triage. The URL addresses the open event.</span>
        ) : activeView === "dead-letters" ? (
          <span className="muted">Dead letters list events whose latest delivery attempt failed. Open one to inspect and replay.</span>
        ) : (
          <span className="muted">Project keeps settings, endpoints, keys, monitoring, and tunnel utilities together.</span>
        )}
      </div>
    </section>
  );
}

type ProjectSummarySectionProps = {
  endpointBase: string;
  ingressUrl: string;
  latestIngressText: string;
  onCopyText: (text: string, label: string) => void;
  projectEndpointCount: number;
  projectEndpoints: ProjectEndpointRow[];
  selectedProject: ProjectRow | null;
};

function truncateMiddle(value: string, lead = 36, tail = 18) {
  if (value.length <= lead + tail + 3) return value;
  return `${value.slice(0, lead)}...${value.slice(-tail)}`;
}

export function ProjectSummarySection({
  endpointBase,
  ingressUrl,
  latestIngressText,
  onCopyText,
  projectEndpointCount,
  projectEndpoints,
  selectedProject
}: ProjectSummarySectionProps) {
  return (
    <section className="project-summary reveal-2 compact">
      <div className="project-summary-main compact">
        <div className="project-summary-head compact">
          <div className="project-name-block compact">
            <div className="project-title-row">
              <strong>{selectedProject?.name ?? "No project selected"}</strong>
              {selectedProject ? <span className="project-status-badge">Active</span> : null}
            </div>
            {selectedProject ? (
              <div className="project-meta-pills compact">
                <span className="project-pill">Slug <code>{selectedProject.slug}</code></span>
                <span className="project-pill">Retention <strong>{selectedProject.retention_days}d</strong></span>
                <span className="project-pill">Latest ingress <strong>{latestIngressText}</strong></span>
              </div>
            ) : (
              <p className="muted">Create a project to start receiving webhooks.</p>
            )}
          </div>
          <div className="project-utility-row">
            <div className="project-ingress-row compact">
              <span className="project-ingress-label">Ingress</span>
              <code className="endpoint-url" title={ingressUrl}>{truncateMiddle(ingressUrl)}</code>
              <button
                className="ghost-btn icon-btn icon-action"
                onClick={() => onCopyText(ingressUrl, "Ingress URL")}
                title="Copy ingress URL"
                aria-label="Copy ingress URL"
                type="button"
              >
                <Copy aria-hidden="true" />
              </button>
            </div>
            {selectedProject ? (
              <details className="endpoints-disclosure">
                <summary>
                  <span>Endpoints</span>
                  <strong>{projectEndpointCount}</strong>
                </summary>
                <div className="project-endpoints-list compact">
                  <div className="project-endpoints-head">
                    <span>Routes</span>
                    <small className="muted">Read-only here</small>
                  </div>
                  <ul>
                    <li>
                      <div>
                        <strong>Primary</strong>
                        <code>/in/{selectedProject.slug}</code>
                      </div>
                      <button
                        className="ghost-btn icon-btn icon-action"
                        onClick={() => onCopyText(ingressUrl, "Ingress URL")}
                        title="Copy primary endpoint"
                        aria-label="Copy primary endpoint"
                        type="button"
                      >
                        <Copy aria-hidden="true" />
                      </button>
                    </li>
                    {projectEndpoints.map((endpoint) => (
                      <li key={endpoint.id}>
                        <div>
                          <strong>{endpoint.name}</strong>
                          <code>/in/{endpoint.path}</code>
                          {endpoint.forward_url ? <small className="endpoint-forward">{"-> "}{endpoint.forward_url}</small> : null}
                        </div>
                        <button
                          className="ghost-btn icon-btn icon-action"
                          onClick={() => onCopyText(`${endpointBase}${endpoint.path}`, "Endpoint URL")}
                          title="Copy endpoint URL"
                          aria-label={`Copy endpoint URL for ${endpoint.name}`}
                          type="button"
                        >
                          <Copy aria-hidden="true" />
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              </details>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}

type DashboardDialogProps = {
  dialog: DialogState;
  dialogForwardUrl: string;
  dialogName: string;
  dialogPath: string;
  dialogSubmitting: boolean;
  onClose: () => void;
  onDialogForwardUrlChange: (value: string) => void;
  onDialogNameChange: (value: string) => void;
  onDialogPathChange: (value: string) => void;
  onSubmit: () => void;
};

export function DashboardDialog({
  dialog,
  dialogForwardUrl,
  dialogName,
  dialogPath,
  dialogSubmitting,
  onClose,
  onDialogForwardUrlChange,
  onDialogNameChange,
  onDialogPathChange,
  onSubmit
}: DashboardDialogProps) {
  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <section className="modal-card" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
        <h3>
          {dialog.kind === "createProject" && "Create Project"}
          {dialog.kind === "editProject" && "Edit Project"}
          {dialog.kind === "archiveProject" && "Archive Project"}
          {dialog.kind === "createEndpoint" && "Create Endpoint"}
          {dialog.kind === "editEndpoint" && "Edit Endpoint"}
          {dialog.kind === "deleteEndpoint" && "Delete Endpoint"}
          {dialog.kind === "createApiKey" && "Create API Key"}
        </h3>

        {dialog.kind === "archiveProject" ? (
          <p className="muted">Archive project "{dialog.projectName}"? Existing data remains but ingress stops.</p>
        ) : null}
        {dialog.kind === "deleteEndpoint" ? (
          <p className="muted">Delete endpoint "{dialog.endpoint.name}" (`/in/{dialog.endpoint.path}`)?</p>
        ) : null}

        {["createProject", "editProject", "createEndpoint", "editEndpoint", "createApiKey"].includes(dialog.kind) ? (
          <div className="modal-fields">
            <label>
              <span>{dialog.kind === "createApiKey" ? "Label" : "Name"}</span>
              <input value={dialogName} onChange={(event) => onDialogNameChange(event.target.value)} />
            </label>
            {["createEndpoint", "editEndpoint"].includes(dialog.kind) ? (
              <>
                <label>
                  <span>Path</span>
                  <input value={dialogPath} onChange={(event) => onDialogPathChange(event.target.value)} />
                </label>
                <label>
                  <span>Forward URL (optional)</span>
                  <input
                    value={dialogForwardUrl}
                    onChange={(event) => onDialogForwardUrlChange(event.target.value)}
                    placeholder="https://example.com/webhook"
                  />
                </label>
              </>
            ) : null}
            {dialog.kind === "editProject" ? (
              <label>
                <span>Primary Forward URL (optional)</span>
                <input
                  value={dialogForwardUrl}
                  onChange={(event) => onDialogForwardUrlChange(event.target.value)}
                  placeholder="https://example.com/webhook"
                />
              </label>
            ) : null}
          </div>
        ) : null}

        <div className="modal-actions">
          <button className="ghost-btn" onClick={onClose} disabled={dialogSubmitting}>Cancel</button>
          <button className="primary-btn" onClick={onSubmit} disabled={dialogSubmitting}>
            {dialogSubmitting ? "Saving…" : "Confirm"}
          </button>
        </div>
      </section>
    </div>
  );
}
