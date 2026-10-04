import { type ChangeEvent, useDeferredValue, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Copy } from "lucide-react";
import { apiDelete, apiGet, apiPatch, apiPost, getApiBase } from "../lib/api";
import { legacyQueryPlace, navigate, routeSlug, useRoute, type Route, type RoutePlace } from "../lib/router";
import { HeroToolbar, ProjectSummarySection, DashboardDialog } from "./dashboard/ChromeSections";
import { DeadLetterView, DLQ_SCAN_LIMIT, type DeadLetterEntry } from "./dashboard/DeadLetterView";
import { ProjectView } from "./dashboard/ProjectView";
import { TriageView } from "./dashboard/TriageView";
import type {
  ApiKeyRow,
  AttemptRow,
  DeliveryHealthMetric,
  DetailedStatusMetric,
  DialogState,
  EventPageInfo,
  EventRow,
  LatencyMetric,
  OpsDestinationFailure,
  OpsSummary,
  ProjectEndpointRow,
  ProjectRow,
  ProjectsVolumeMetric,
  StatusBucketMetric,
  TimeseriesPoint,
  TunnelAttemptRow,
  TunnelConnection
} from "./dashboard/types";

export function DashboardApp() {
  const [authResolved, setAuthResolved] = useState(false);
  const [me, setMe] = useState<{ id: string; name: string; email: string; picture: string } | null>(null);
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [eventsPageInfo, setEventsPageInfo] = useState<EventPageInfo>({ nextCursor: null, hasMore: false });
  const [isLoadingMoreEvents, setIsLoadingMoreEvents] = useState(false);
  const [attempts, setAttempts] = useState<AttemptRow[]>([]);
  const [apiKeys, setApiKeys] = useState<ApiKeyRow[]>([]);
  const [newApiKey, setNewApiKey] = useState<string | null>(null);
  const [windowPreset, setWindowPreset] = useState<"24h" | "7d" | "30d">("7d");
  const [isPending, startTransition] = useTransition();
  const [projectsVolume, setProjectsVolume] = useState<ProjectsVolumeMetric[]>([]);
  const [timeseries, setTimeseries] = useState<TimeseriesPoint[]>([]);
  const [statusBuckets, setStatusBuckets] = useState<StatusBucketMetric[]>([]);
  const [statusDetails, setStatusDetails] = useState<DetailedStatusMetric[]>([]);
  const [latency, setLatency] = useState<LatencyMetric>({ p50: 0, p95: 0, p99: 0, avg: 0, max: 0 });
  const [health, setHealth] = useState<DeliveryHealthMetric>({ successCount: 0, failedCount: 0, successRate: 0 });
  const [payload, setPayload] = useState<string>("");
  const [eventMethod, setEventMethod] = useState<string>("POST");
  const [eventReplay, setEventReplay] = useState(false);
  const [eventEndpointPath, setEventEndpointPath] = useState<string | null>(null);
  const [eventQueryParams, setEventQueryParams] = useState<Record<string, string | string[]>>({});
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [query, setQuery] = useState("");
  const [showReplaysOnly, setShowReplaysOnly] = useState(false);
  const [timeZoneMode, setTimeZoneMode] = useState<"local" | "utc">("local");
  const [fromDateTime, setFromDateTime] = useState("");
  const [toDateTime, setToDateTime] = useState("");
  const [autoRefresh, setAutoRefresh] = useState(false);
  const route = useRoute();
  const routeRef = useRef<Route | null>(route);
  routeRef.current = route;
  const [density, setDensity] = useState<"comfortable" | "compact">("comfortable");
  const deferredQuery = useDeferredValue(query);
  const [tunnels, setTunnels] = useState<TunnelConnection[]>([]);
  const [eventTunnels, setEventTunnels] = useState<TunnelAttemptRow[]>([]);
  const [selectedTunnel, setSelectedTunnel] = useState<string | null>(null);
  const [opsSummary, setOpsSummary] = useState<OpsSummary>({
    ingressCount: 0,
    rateLimitedCount: 0,
    rateLimitedProject: 0,
    rateLimitedIp: 0
  });
  const [opsAlerts, setOpsAlerts] = useState<Record<string, number>>({});
  const [opsRateLimitedSeries, setOpsRateLimitedSeries] = useState<TimeseriesPoint[]>([]);
  const [opsTopFailures, setOpsTopFailures] = useState<OpsDestinationFailure[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [showRevokedKeys, setShowRevokedKeys] = useState(false);
  const [projectEndpoints, setProjectEndpoints] = useState<ProjectEndpointRow[]>([]);
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [dialogName, setDialogName] = useState("");
  const [dialogPath, setDialogPath] = useState("");
  const [dialogForwardUrl, setDialogForwardUrl] = useState("");
  const [dialogSubmitting, setDialogSubmitting] = useState(false);

  const selectedProject = useMemo(() => projects.find((p) => p.slug === routeSlug(route)) ?? null, [projects, route]);
  const selectedProjectId = selectedProject?.id ?? null;
  const selectedEvent = route?.place === "events" ? route.eventId : null;
  const selectedEventRow = useMemo(() => events.find((evt) => evt.id === selectedEvent) ?? null, [events, selectedEvent]);
  const attemptCacheRef = useRef(new Map<string, AttemptRow[]>());
  const [dlqVersion, setDlqVersion] = useState(0);
  const [dlqScanning, setDlqScanning] = useState(false);
  const filteredEvents = useMemo(() => {
    const parseFilterDateTime = (value: string): number | null => {
      if (!value) return null;
      if (timeZoneMode === "utc") {
        const utcValue = value.length === 16 ? `${value}:00Z` : `${value}Z`;
        const utcMs = Date.parse(utcValue);
        return Number.isFinite(utcMs) ? utcMs : null;
      }
      const localMs = Date.parse(value);
      return Number.isFinite(localMs) ? localMs : null;
    };
    const fromMs = parseFilterDateTime(fromDateTime);
    const toMs = parseFilterDateTime(toDateTime);
    return events.filter((evt) => {
      if (showReplaysOnly && evt.replay !== true) return false;
      if (deferredQuery.trim()) {
        const q = deferredQuery.toLowerCase();
        const queryMatch =
          evt.id.toLowerCase().includes(q) ||
          evt.project_slug.toLowerCase().includes(q) ||
          endpointPathForEvent(evt).toLowerCase().includes(q);
        if (!queryMatch) return false;
      }
      if (fromMs !== null && evt.received_at < fromMs) return false;
      if (toMs !== null && evt.received_at > toMs) return false;
      return true;
    });
  }, [events, deferredQuery, showReplaysOnly, fromDateTime, toDateTime, timeZoneMode]);

  const ingressUrl = `${getApiBase()}/in/${selectedProject?.slug ?? "..."}`;
  const latestEvent = events[0] ?? null;
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const revokedCount = useMemo(() => apiKeys.filter((k) => k.revoked_at).length, [apiKeys]);
  const visibleKeys = useMemo(
    () => apiKeys.filter((k) => showRevokedKeys || !k.revoked_at),
    [apiKeys, showRevokedKeys]
  );
  const endpointBase = `${getApiBase()}/in/`;
  const projectEndpointCount = selectedProject ? projectEndpoints.length + 1 : 0;
  const activeTunnelCount = useMemo(() => tunnels.filter((tunnel) => tunnel.status === "live").length, [tunnels]);
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (showReplaysOnly) count += 1;
    if (density === "compact") count += 1;
    if (timeZoneMode === "utc") count += 1;
    if (fromDateTime) count += 1;
    if (toDateTime) count += 1;
    return count;
  }, [density, fromDateTime, showReplaysOnly, timeZoneMode, toDateTime]);

  function endpointPathForEvent(event: Pick<EventRow, "endpoint_path" | "project_slug">): string {
    return event.endpoint_path?.trim() || event.project_slug;
  }

  function copyText(text: string, label: string) {
    void navigator.clipboard.writeText(text);
    setToast(`${label} copied`);
    setTimeout(() => setToast(null), 2000);
  }

  async function bootstrap() {
    try {
      const [meRes, projectRes] = await Promise.all([
        apiGet<{ user: { id: string; name: string; email: string; picture: string } }>("/api/me"),
        apiGet<{ projects: ProjectRow[] }>("/api/projects")
      ]);
      setMe(meRes.user);
      setProjects(projectRes.projects);
      if (projectRes.projects.length === 0) {
        const created = await apiPost<{ project: ProjectRow }>("/api/projects", { name: "My First Project" });
        setProjects([created.project]);
      }
    } catch {
      setMe(null);
    } finally {
      setAuthResolved(true);
    }
  }

  useEffect(() => {
    void bootstrap();
  }, []);

  // Addressable places: default to the first project when no (or an unknown) slug is
  // addressed, translating legacy `?tab=` URLs once. Runs as a correction (replace).
  useEffect(() => {
    if (!authResolved || projects.length === 0 || typeof window === "undefined") return;
    const slugKnown = projects.some((p) => p.slug === route?.slug);
    if (route && slugKnown) return;
    const fallbackSlug = projects[0].slug;
    const legacy = legacyQueryPlace(window.location.search);
    const next: Route = legacy
      ? { place: "project", slug: fallbackSlug, section: legacy.section }
      : { place: "events", slug: fallbackSlug, eventId: null };
    navigate(next, { replace: true });
    if (legacy) {
      window.history.replaceState({}, "", `${window.location.pathname}${window.location.hash}`);
    }
  }, [authResolved, projects, route]);

  async function loadEvents(options?: { append?: boolean }) {
    if (!selectedProjectId) return;
    const append = options?.append === true;
    if (append && !eventsPageInfo.nextCursor) return;
    try {
      if (append) setIsLoadingMoreEvents(true);
      else setIsRefreshing(true);
      setError(null);
      const beforeParam = append && eventsPageInfo.nextCursor ? `&before=${encodeURIComponent(eventsPageInfo.nextCursor)}` : "";
      const data = await apiGet<{ events: EventRow[]; pageInfo: EventPageInfo }>(
        `/api/projects/${selectedProjectId}/events?limit=100${beforeParam}`
      );
      setEvents((previous) => (append ? [...previous, ...data.events] : data.events));
      setEventsPageInfo(data.pageInfo ?? { nextCursor: null, hasMore: false });
      if (!append) {
        if (data.events.length === 0) {
          setAttempts([]);
          setPayload("");
          setEventTunnels([]);
          setEventEndpointPath(null);
          setEventQueryParams({});
        } else {
          const current = routeRef.current;
          const addressed = current?.place === "events" ? current.eventId : null;
          if ((!addressed || !data.events.some((event) => event.id === addressed)) && current?.place === "events") {
            navigate({ place: "events", slug: current.slug, eventId: data.events[0].id }, { replace: true });
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "unknown error");
    } finally {
      if (append) setIsLoadingMoreEvents(false);
      else setIsRefreshing(false);
    }
  }

  async function loadEventDetail(eventId: string) {
    if (!selectedProjectId) return;
    try {
      setIsLoadingDetail(true);
      // Prevent stale endpoint text while detail request is in flight.
      setEventEndpointPath(null);
      const [attemptData, payloadData, tunnelData] = await Promise.all([
        apiGet<{ attempts: AttemptRow[] }>(`/api/projects/${selectedProjectId}/events/${eventId}/attempts`),
        apiGet<{ payload: string; method?: string; queryParams?: Record<string, string | string[]>; endpointPath?: string | null; replay?: boolean }>(
          `/api/projects/${selectedProjectId}/events/${eventId}/payload`
        ),
        apiGet<{ tunnels: TunnelAttemptRow[] }>(`/api/projects/${selectedProjectId}/events/${eventId}/tunnels`)
      ]);
      setAttempts(attemptData.attempts);
      attemptCacheRef.current.set(eventId, attemptData.attempts);
      setPayload(payloadData.payload);
      setEventMethod((payloadData.method ?? "POST").toUpperCase());
      setEventReplay(payloadData.replay === true);
      setEventEndpointPath(payloadData.endpointPath ?? null);
      setEventQueryParams(payloadData.queryParams ?? {});
      setEventTunnels(tunnelData.tunnels);
    } finally {
      setIsLoadingDetail(false);
    }
  }

  // The addressed event drives the detail panel; deep links land here.
  const addressedEventId = route?.place === "events" ? route.eventId : null;
  useEffect(() => {
    if (!selectedProjectId || !addressedEventId) return;
    void loadEventDetail(addressedEventId);
  }, [selectedProjectId, addressedEventId]);

  async function replayEvent(eventId?: string) {
    const target = eventId ?? (routeRef.current?.place === "events" ? routeRef.current.eventId : null);
    if (!target || !selectedProjectId) return;
    await apiPost(`/api/projects/${selectedProjectId}/events/${target}/replay`);
    attemptCacheRef.current.delete(target);
    await loadEvents();
  }

  const selectedEventIndex = useMemo(
    () => filteredEvents.findIndex((evt) => evt.id === selectedEvent),
    [filteredEvents, selectedEvent]
  );

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTyping =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable);
      if (event.key === "/" && !isTyping) {
        event.preventDefault();
        searchInputRef.current?.focus();
        return;
      }
      if (routeRef.current?.place !== "events" || isTyping) return;
      if (event.key.toLowerCase() === "j" && filteredEvents.length) {
        event.preventDefault();
        const next = Math.min(filteredEvents.length - 1, Math.max(0, selectedEventIndex + 1));
        if (routeRef.current) navigate({ place: "events", slug: routeRef.current.slug, eventId: filteredEvents[next].id }, { replace: true });
      } else if (event.key.toLowerCase() === "k" && filteredEvents.length) {
        event.preventDefault();
        const prev = Math.max(0, selectedEventIndex <= 0 ? 0 : selectedEventIndex - 1);
        if (routeRef.current) navigate({ place: "events", slug: routeRef.current.slug, eventId: filteredEvents[prev].id }, { replace: true });
      } else if (event.key.toLowerCase() === "r" && selectedEvent) {
        event.preventDefault();
        void replayEvent();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [filteredEvents, selectedEvent, selectedEventIndex]);

  async function loadApiKeys() {
    if (!selectedProjectId) return;
    const data = await apiGet<{ apiKeys: ApiKeyRow[] }>(`/api/projects/${selectedProjectId}/api-keys`);
    setApiKeys(data.apiKeys);
  }

  async function loadProjectEndpoints() {
    if (!selectedProjectId) return;
    try {
      const data = await apiGet<{ endpoints: ProjectEndpointRow[] }>(`/api/projects/${selectedProjectId}/endpoints`);
      setProjectEndpoints(data.endpoints);
    } catch {
      setProjectEndpoints([]);
    }
  }

  async function loadTunnels() {
    if (!selectedProject?.slug) {
      setTunnels([]);
      return;
    }
    try {
      const data = await apiGet<{ tunnels: TunnelConnection[] }>(`/api/tunnels?projectSlug=${encodeURIComponent(selectedProject.slug)}`);
      setTunnels(data.tunnels);
    } catch {
      setTunnels([]);
    }
  }

  async function disconnectTunnel(tunnelId: string) {
    await apiPost("/api/tunnels/disconnect", { tunnelId, projectSlug: selectedProject?.slug ?? null });
    await loadTunnels();
  }

  async function refreshProjects() {
    const projectRes = await apiGet<{ projects: ProjectRow[] }>("/api/projects");
    setProjects(projectRes.projects);
  }

  function createProject() {
    setDialogName("New Project");
    setDialog({ kind: "createProject" });
  }

  function updateProject() {
    if (!selectedProject) return;
    setDialogName(selectedProject.name);
    setDialogForwardUrl(selectedProject.primary_forward_url ?? "");
    setDialog({
      kind: "editProject",
      projectId: selectedProject.id,
      currentName: selectedProject.name,
      currentPrimaryForwardUrl: selectedProject.primary_forward_url ?? null
    });
  }

  function deleteProject() {
    if (!selectedProject) return;
    setDialog({ kind: "archiveProject", projectId: selectedProject.id, projectName: selectedProject.name });
  }

  function createEndpoint() {
    if (!selectedProjectId) return;
    setDialogName("Public endpoint");
    setDialogPath(`${selectedProject?.slug ?? "endpoint"}-alt`);
    setDialogForwardUrl("");
    setDialog({ kind: "createEndpoint" });
  }

  function editEndpoint(endpoint: ProjectEndpointRow) {
    if (!selectedProjectId) return;
    setDialogName(endpoint.name);
    setDialogPath(endpoint.path);
    setDialogForwardUrl(endpoint.forward_url ?? "");
    setDialog({ kind: "editEndpoint", endpoint });
  }

  function deleteEndpoint(endpoint: ProjectEndpointRow) {
    if (!selectedProjectId) return;
    setDialog({ kind: "deleteEndpoint", endpoint });
  }

  function createApiKey() {
    if (!selectedProjectId) return;
    setDialogName("Default");
    setDialog({ kind: "createApiKey" });
  }

  async function submitDialog() {
    if (!dialog) return;
    setDialogSubmitting(true);
    let success = false;
    try {
      setError(null);
      if (dialog.kind === "createProject") {
        const name = dialogName.trim();
        if (!name) throw new Error("Project name is required");
        await apiPost<{ project: ProjectRow }>("/api/projects", { name });
        await refreshProjects();
        success = true;
      }
      else if (dialog.kind === "editProject") {
        const name = dialogName.trim();
        const primaryForwardUrl = dialogForwardUrl.trim() || null;
        if (!name) throw new Error("Project name is required");
        if (name !== dialog.currentName || primaryForwardUrl !== dialog.currentPrimaryForwardUrl) {
          await apiPatch(`/api/projects/${dialog.projectId}`, { name, primary_forward_url: primaryForwardUrl });
          await refreshProjects();
        }
        success = true;
      }
      else if (dialog.kind === "archiveProject") {
        await apiDelete(`/api/projects/${dialog.projectId}`);
        await refreshProjects();
        success = true;
      }
      else if (dialog.kind === "createEndpoint") {
        if (!selectedProjectId) throw new Error("No project selected");
        const name = dialogName.trim();
        const path = dialogPath.trim();
        const forwardUrl = dialogForwardUrl.trim();
        if (!name || !path) throw new Error("Endpoint name and path are required");
        await apiPost(`/api/projects/${selectedProjectId}/endpoints`, { name, path, forward_url: forwardUrl || null });
        await loadProjectEndpoints();
        success = true;
      }
      else if (dialog.kind === "editEndpoint") {
        if (!selectedProjectId) throw new Error("No project selected");
        const name = dialogName.trim();
        const path = dialogPath.trim();
        const forwardUrl = dialogForwardUrl.trim();
        if (!name || !path) throw new Error("Endpoint name and path are required");
        await apiPatch(`/api/projects/${selectedProjectId}/endpoints/${dialog.endpoint.id}`, {
          name,
          path,
          forward_url: forwardUrl || null
        });
        await loadProjectEndpoints();
        success = true;
      }
      else if (dialog.kind === "deleteEndpoint") {
        if (!selectedProjectId) throw new Error("No project selected");
        await apiDelete(`/api/projects/${selectedProjectId}/endpoints/${dialog.endpoint.id}`);
        await loadProjectEndpoints();
        success = true;
      }
      else if (dialog.kind === "createApiKey") {
        if (!selectedProjectId) throw new Error("No project selected");
        const label = dialogName.trim() || "Default";
        const data = await apiPost<{ apiKey: { id: string; token: string } }>(`/api/projects/${selectedProjectId}/api-keys`, { label });
        setNewApiKey(data.apiKey.token);
        await loadApiKeys();
        success = true;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setDialogSubmitting(false);
    }
    if (success) {
      setDialog(null);
    }
  }

  function closeDialog() {
    if (dialogSubmitting) return;
    setDialog(null);
  }

  async function loadMetrics() {
    if (!selectedProjectId) return;
    const [volume, trend, buckets, details, latencyRes, healthRes, opsRes] = await Promise.all([
      apiGet<{ metrics: ProjectsVolumeMetric[] }>(`/api/metrics/projects-volume?window=${windowPreset}`),
      apiGet<{ points: TimeseriesPoint[] }>(
        `/api/metrics/project/${selectedProjectId}/timeseries?window=${windowPreset}&bucket=${windowPreset === "24h" ? "hour" : "day"}`
      ),
      apiGet<{ metrics: StatusBucketMetric[] }>(`/api/metrics/project/${selectedProjectId}/status-codes?window=${windowPreset}`),
      apiGet<{ metrics: DetailedStatusMetric[] }>(
        `/api/metrics/project/${selectedProjectId}/status-codes-detailed?window=${windowPreset}`
      ),
      apiGet<{ latency: LatencyMetric }>(`/api/metrics/project/${selectedProjectId}/latency?window=${windowPreset}`),
      apiGet<{ health: DeliveryHealthMetric }>(`/api/metrics/project/${selectedProjectId}/delivery-health?window=${windowPreset}`),
      apiGet<{
        summary: OpsSummary;
        alerts: Record<string, number>;
        rateLimitedSeries: TimeseriesPoint[];
        topFailingDestinations: OpsDestinationFailure[];
      }>(`/api/metrics/project/${selectedProjectId}/ops?window=${windowPreset}`)
    ]);
    setProjectsVolume(volume.metrics);
    setTimeseries(trend.points);
    setStatusBuckets(buckets.metrics);
    setStatusDetails(details.metrics);
    setLatency(latencyRes.latency);
    setHealth(healthRes.health);
    setOpsSummary(opsRes.summary);
    setOpsAlerts(opsRes.alerts);
    setOpsRateLimitedSeries(opsRes.rateLimitedSeries);
    setOpsTopFailures(opsRes.topFailingDestinations);
  }


  async function rotateApiKey(keyId: string) {
    if (!selectedProjectId) return;
    try {
      setError(null);
      const data = await apiPost<{ apiKey: { id: string; token: string } }>(
        `/api/projects/${selectedProjectId}/api-keys/${keyId}/rotate`
      );
      setNewApiKey(data.apiKey.token);
      await loadApiKeys();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to rotate API key");
    }
  }

  async function revokeApiKey(keyId: string) {
    if (!selectedProjectId) return;
    try {
      setError(null);
      await apiDelete(`/api/projects/${selectedProjectId}/api-keys/${keyId}`);
      await loadApiKeys();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to revoke API key");
    }
  }

  useEffect(() => {
    if (!selectedProjectId) return;
    void loadEvents();
    void loadApiKeys();
    void loadProjectEndpoints();
    void loadMetrics();
    void loadTunnels();
  }, [selectedProjectId, windowPreset]);

  useEffect(() => {
    setEvents([]);
    setEventsPageInfo({ nextCursor: null, hasMore: false });
    setAttempts([]);
    setPayload("");
    setEventMethod("POST");
    setEventReplay(false);
    setEventEndpointPath(null);
    setEventQueryParams({});
    setEventTunnels([]);
    setApiKeys([]);
    setProjectEndpoints([]);
    setTunnels([]);
    setSelectedTunnel(null);
    setNewApiKey(null);
  }, [selectedProjectId]);

  useEffect(() => {
    if (!autoRefresh || !selectedProjectId) return;
    const timer = window.setInterval(() => {
      void loadEvents();
      void loadTunnels();
    }, 8000);
    return () => window.clearInterval(timer);
  }, [autoRefresh, selectedProjectId]);

  const prettyPayload = useMemo(() => {
    try {
      return JSON.stringify(JSON.parse(payload), null, 2);
    } catch {
      return payload;
    }
  }, [payload]);

  function timeAgo(ts: number): string {
    const delta = Math.max(1, Math.floor((Date.now() - ts) / 1000));
    if (delta < 60) return `${delta}s ago`;
    if (delta < 3600) return `${Math.floor(delta / 60)}m ago`;
    if (delta < 86400) return `${Math.floor(delta / 3600)}h ago`;
    return `${Math.floor(delta / 86400)}d ago`;
  }

  const eventDateTimeFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(undefined, {
        dateStyle: "short",
        timeStyle: "medium",
        ...(timeZoneMode === "utc" ? { timeZone: "UTC" } : {})
      }),
    [timeZoneMode]
  );

  function formatEventTimestamp(ts: number): string {
    return `${eventDateTimeFormatter.format(new Date(ts))}${timeZoneMode === "utc" ? " UTC" : ""}`;
  }

  function countryFlag(country: string | null): string | null {
    if (!country) return null;
    const code = country.trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(code)) return null;
    const base = 127397;
    return String.fromCodePoint(code.charCodeAt(0) + base, code.charCodeAt(1) + base);
  }

  const dateTime = useMemo(
    () => new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }),
    []
  );
  const dateOnly = useMemo(
    () => new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }),
    []
  );

  async function logout() {
    await apiPost("/api/logout");
    window.location.reload();
  }

  function handleProjectSelect(event: ChangeEvent<HTMLSelectElement>) {
    const slug = event.target.value;
    const current = routeRef.current;
    const place: RoutePlace = current?.place ?? "events";
    startTransition(() => {
      if (place === "project") navigate({ place: "project", slug, section: current?.place === "project" ? current.section : "overview" });
      else if (place === "dead-letters") navigate({ place: "dead-letters", slug });
      else navigate({ place: "events", slug, eventId: null });
    });
  }

  function switchPlace(place: RoutePlace) {
    const slug = routeSlug(routeRef.current) ?? selectedProject?.slug ?? projects[0]?.slug;
    if (!slug) return;
    if (place === "project") {
      navigate({ place: "project", slug, section: routeRef.current?.place === "project" ? routeRef.current.section : "overview" });
    } else if (place === "dead-letters") {
      navigate({ place: "dead-letters", slug });
    } else {
      navigate({ place: "events", slug, eventId: null });
    }
  }

  // Dead-letter scan: attempts of the newest events, cached per event. Provisional —
  // the right fix is a worker-side failed-events query (docs/design/layers/decisions.md, D6).
  const dlqCandidates = useMemo(() => events.slice(0, DLQ_SCAN_LIMIT), [events]);
  const dlqScannedCount = useMemo(
    () => dlqCandidates.filter((event) => attemptCacheRef.current.has(event.id)).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dlqCandidates, dlqVersion]
  );
  useEffect(() => {
    if (!selectedProjectId || route?.place !== "dead-letters") return;
    const missing = dlqCandidates.filter((event) => !attemptCacheRef.current.has(event.id));
    if (missing.length === 0) return;
    let active = true;
    setDlqScanning(true);
    void (async () => {
      const results = await Promise.all(
        missing.map(async (event) => {
          try {
            const data = await apiGet<{ attempts: AttemptRow[] }>(`/api/projects/${selectedProjectId}/events/${event.id}/attempts`);
            return [event.id, data.attempts] as const;
          } catch {
            return [event.id, [] as AttemptRow[]] as const;
          }
        })
      );
      for (const [eventId, attemptsForEvent] of results) {
        attemptCacheRef.current.set(eventId, attemptsForEvent);
      }
      if (!active) return;
      setDlqVersion((version) => version + 1);
      setDlqScanning(false);
    })();
    return () => {
      active = false;
    };
  }, [selectedProjectId, route?.place, dlqCandidates, dlqVersion]);

  const deadLetterEntries = useMemo<DeadLetterEntry[]>(() => {
    const entries: DeadLetterEntry[] = [];
    for (const event of dlqCandidates) {
      const attemptsForEvent = attemptCacheRef.current.get(event.id);
      if (!attemptsForEvent) continue;
      const latestByTarget = new Map<string, AttemptRow>();
      for (const attempt of attemptsForEvent) {
        const key = attempt.destination_id ?? "target";
        const existing = latestByTarget.get(key);
        if (!existing || attempt.attempt_no >= existing.attempt_no) latestByTarget.set(key, attempt);
      }
      const failed = [...latestByTarget.values()]
        .filter((attempt) => attempt.success !== 1)
        .sort((a, b) => b.attempted_at - a.attempted_at);
      if (failed.length > 0) {
        entries.push({ event, failed, lastAttemptedAt: failed[0].attempted_at });
      }
    }
    return entries.sort((a, b) => b.lastAttemptedAt - a.lastAttemptedAt);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dlqCandidates, dlqVersion]);

  function rescanDeadLetters() {
    for (const event of dlqCandidates) {
      attemptCacheRef.current.delete(event.id);
    }
    setDlqVersion((version) => version + 1);
  }

  if (!authResolved) {
    return (
      <main className="layout">
        <section className="top-shell reveal-1">
          <div>
            <p className="eyebrow">Webhook Control Room</p>
            <h1>Payetonhook</h1>
            <p className="subtitle">Restoring session...</p>
          </div>
        </section>
      </main>
    );
  }

  if (!me) {
    const loginUrl = `${getApiBase()}/auth/google/start?redirectTo=${encodeURIComponent(window.location.href)}`;
    return (
      <main className="layout">
        <section className="top-shell reveal-1">
          <div>
            <p className="eyebrow">Webhook Control Room</p>
            <h1>Payetonhook</h1>
            <p className="subtitle">Sign in with Google to manage projects, keys, and event delivery from one place.</p>
            <a className="primary-btn login-link" href={loginUrl}>
              Continue with Google
            </a>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="layout">
      <a className="skip-link" href="#main-workspace">Skip to workspace</a>
      <HeroToolbar
        activeView={route?.place ?? "events"}
        isPending={isPending}
        meName={me.name}
        onActiveViewChange={switchPlace}
        onLogout={() => void logout()}
        onProjectSelect={handleProjectSelect}
        projects={projects}
        selectedProjectSlug={selectedProject?.slug ?? null}
      />

      {route?.place === "events" ? (
        <ProjectSummarySection
          endpointBase={endpointBase}
          ingressUrl={ingressUrl}
          latestIngressText={latestEvent ? timeAgo(latestEvent.received_at) : "none"}
          onCopyText={copyText}
          projectEndpointCount={projectEndpointCount}
          projectEndpoints={projectEndpoints}
          selectedProject={selectedProject}
        />
      ) : null}

      {route?.place === "events" ? (
        <div className="view-toolbar reveal-3">
          <div className="view-toolbar-main">
            <label className="field-label field-label-search">
              <span>Jump to event</span>
              <input
                ref={searchInputRef}
                className="search-input"
                placeholder="Event id, project, endpoint"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                aria-label="Search events"
                name="event-search"
                autoComplete="off"
              />
            </label>
          </div>
          <div className="view-toolbar-actions">
            <button className="ghost-btn" onClick={() => void loadEvents()} disabled={!selectedProjectId || isRefreshing}>
              {isRefreshing ? "Refreshing…" : "Refresh"}
            </button>
            <label className="toggle toggle-pill">
              <input
                className="toggle-input"
                type="checkbox"
                checked={autoRefresh}
                onChange={(event) => setAutoRefresh(event.target.checked)}
              />
              <span>{autoRefresh ? "Auto refresh on" : "Auto refresh off"}</span>
            </label>
            <details className="filter-disclosure">
              <summary>
                <span>Filters</span>
                <strong>{activeFilterCount}</strong>
              </summary>
              <div className="filter-grid">
                <label className="toggle toggle-pill">
                  <input type="checkbox" checked={showReplaysOnly} onChange={(e) => setShowReplaysOnly(e.target.checked)} />
                  <span>Replays only</span>
                </label>
                <label className="toggle toggle-pill">
                  <input type="checkbox" checked={density === "compact"} onChange={(e) => setDensity(e.target.checked ? "compact" : "comfortable")} />
                  <span>Compact density</span>
                </label>
                <label className="field-label field-label-narrow">
                  <span>Timezone</span>
                  <select value={timeZoneMode} onChange={(e) => setTimeZoneMode(e.target.value as "local" | "utc")} aria-label="Timezone mode">
                    <option value="local">Local</option>
                    <option value="utc">UTC</option>
                  </select>
                </label>
                <label className="field-label">
                  <span>From</span>
                  <input
                    type="datetime-local"
                    value={fromDateTime}
                    onChange={(e) => setFromDateTime(e.target.value)}
                    aria-label="From datetime"
                  />
                </label>
                <label className="field-label">
                  <span>To</span>
                  <input
                    type="datetime-local"
                    value={toDateTime}
                    onChange={(e) => setToDateTime(e.target.value)}
                    aria-label="To datetime"
                  />
                </label>
              </div>
            </details>
          </div>
          <div className="filter-meta">
            <p className="keyboard-hint">{filteredEvents.length} of {events.length} events shown</p>
            <button
              className="ghost-btn"
              onClick={() => {
                setFromDateTime("");
                setToDateTime("");
                setShowReplaysOnly(false);
                setDensity("comfortable");
                setTimeZoneMode("local");
              }}
            >
              Reset filters
            </button>
          </div>
        </div>
      ) : null}

      {error ? <p className="error">{error}</p> : null}
      {newApiKey ? (
        <p className="new-key">
          <span aria-live="polite">
            New key (shown once): <code>{newApiKey}</code>
          </span>
          <button
            className="ghost-btn icon-btn icon-action"
            onClick={() => copyText(newApiKey, "API key")}
            aria-label="Copy API key"
            type="button"
            style={{ marginLeft: "0.5rem" }}
          >
            <Copy aria-hidden="true" />
          </button>
        </p>
      ) : null}

      {/* ── Events (triage) ─────────────────────────── */}
      {route?.place === "events" ? (
        <TriageView
          attempts={attempts}
          countryFlag={countryFlag}
          deadLettersCount={attempts.filter((a) => a.success === 0).length}
          density={density}
          endpointPathForEvent={endpointPathForEvent}
          eventEndpointPath={eventEndpointPath}
          eventMethod={eventMethod}
          eventQueryParams={eventQueryParams}
          eventReplay={eventReplay}
          eventTunnels={eventTunnels}
          events={events}
          eventsPageInfo={eventsPageInfo}
          filteredEvents={filteredEvents}
          formatEventTimestamp={formatEventTimestamp}
          isLoadingDetail={isLoadingDetail}
          isLoadingMoreEvents={isLoadingMoreEvents}
          isRefreshing={isRefreshing}
          latestEvent={latestEvent}
          onCopyText={copyText}
          onLoadMore={() => void loadEvents({ append: true })}
          onOpenDeadLetters={() => switchPlace("dead-letters")}
          onReplayEvent={() => void replayEvent()}
          onSelectEvent={(eventId) => {
            const current = routeRef.current;
            if (current) navigate({ place: "events", slug: current.slug, eventId });
          }}
          prettyPayload={prettyPayload}
          selectedEvent={selectedEvent}
          selectedEventRow={selectedEventRow}
          timeAgo={timeAgo}
        />
      ) : null}

      {/* ── Dead letters ────────────────────────────── */}
      {route?.place === "dead-letters" ? (
        <DeadLetterView
          entries={deadLetterEntries}
          formatEventTimestamp={formatEventTimestamp}
          isRefreshing={isRefreshing}
          onOpenEvent={(eventId) => {
            const current = routeRef.current;
            if (current) navigate({ place: "events", slug: current.slug, eventId });
          }}
          onRefresh={() => void loadEvents()}
          onReplayEvent={(eventId) => void replayEvent(eventId)}
          onRescan={rescanDeadLetters}
          scanning={dlqScanning}
          scannedCount={dlqScannedCount}
          timeAgo={timeAgo}
          totalLoaded={events.length}
        />
      ) : null}

      {route?.place === "project" && route.section ? (
        <ProjectView
          activeSection={route.section}
          activeTunnelCount={activeTunnelCount}
          countryFlag={countryFlag}
          dateOnly={dateOnly}
          endpointBase={endpointBase}
          health={health}
          ingressUrl={ingressUrl}
          latency={latency}
          latestIngressText={latestEvent ? timeAgo(latestEvent.received_at) : "none"}
          onCopyText={copyText}
          onCreateApiKey={createApiKey}
          onCreateEndpoint={createEndpoint}
          onCreateProject={createProject}
          onDeleteEndpoint={deleteEndpoint}
          onDeleteProject={deleteProject}
          onDisconnectTunnel={(tunnelId) => void disconnectTunnel(tunnelId)}
          onEditEndpoint={editEndpoint}
          onRevokeApiKey={(keyId) => void revokeApiKey(keyId)}
          onRotateApiKey={(keyId) => void rotateApiKey(keyId)}
          onSectionChange={(section) => {
            const current = routeRef.current;
            if (current) navigate({ place: "project", slug: current.slug, section });
          }}
          onSelectTunnel={setSelectedTunnel}
          onToggleShowRevokedKeys={() => setShowRevokedKeys((value) => !value)}
          onUpdateProject={updateProject}
          onWindowPresetChange={setWindowPreset}
          opsAlerts={opsAlerts}
          opsRateLimitedSeries={opsRateLimitedSeries}
          opsSummary={opsSummary}
          opsTopFailures={opsTopFailures}
          projectEndpointCount={projectEndpointCount}
          projectEndpoints={projectEndpoints}
          projectsVolume={projectsVolume}
          revokedCount={revokedCount}
          selectedProject={selectedProject}
          selectedTunnel={selectedTunnel}
          showRevokedKeys={showRevokedKeys}
          statusBuckets={statusBuckets}
          statusDetails={statusDetails}
          timeAgo={timeAgo}
          timeseries={timeseries}
          tunnels={tunnels}
          visibleKeys={visibleKeys}
          windowPreset={windowPreset}
        />
      ) : null}

      {dialog ? (
        <DashboardDialog
          dialog={dialog}
          dialogForwardUrl={dialogForwardUrl}
          dialogName={dialogName}
          dialogPath={dialogPath}
          dialogSubmitting={dialogSubmitting}
          onClose={closeDialog}
          onDialogForwardUrlChange={setDialogForwardUrl}
          onDialogNameChange={setDialogName}
          onDialogPathChange={setDialogPath}
          onSubmit={() => void submitDialog()}
        />
      ) : null}

      {/* Toast notification */}
      {toast ? <div className="toast">{toast}</div> : null}
    </main>
  );
}
