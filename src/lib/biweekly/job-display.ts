/** Display and poll helpers for official biweekly jobs. Period list `latest_job` is the source on load. */

export const POLL_INTERVAL_MS = 3000;
export const POLL_MAX_ATTEMPTS = 120;
export const POLL_MAX_CONSECUTIVE_ERRORS = 3;

export const TERMINAL_JOB_STATUSES = new Set(["ready", "failed", "evidence_limited"]);
export const IN_FLIGHT_JOB_STATUSES = new Set(["queued", "running", "dispatched", "registration_pending"]);

export const REGISTRATION_PENDING_NOTE = "出报文件已上传，正在等待官方登记，可自动重试。此时不能下载。";

/** Official periods list latest_job: job_id, status, created_at, reference only. */
export interface BiweeklyLatestJob {
  job_id: string;
  status: string;
  created_at?: string;
  reference?: boolean;
}

/** Official GET /jobs/{id} artifact. Download requires a persisted path. */
export interface BiweeklyJobArtifact {
  path?: string;
  filename?: string;
  mime?: string;
  sha256?: string;
  size_bytes?: number;
  kind?: string;
}

/** Fields that exist on official GET job or the tab's client-side error path. Do not invent URLs. */
export interface JobView {
  job_id?: string;
  status?: string;
  kind?: string;
  error?: string;
  error_code?: string | null;
  dispatched_to_production?: boolean;
  created_at?: string;
  updated_at?: string;
  reference?: boolean;
  artifact?: BiweeklyJobArtifact | null;
  result?: {
    phase?: unknown;
    planned_batch?: unknown;
    brief?: unknown;
    generate?: {status?: string; error_code?: string | null; artifact_kind?: string};
    [key: string]: unknown;
  };
}

export interface PollScope {
  landId: string;
  periodId: string;
  jobId: string;
  generation: number;
}

export type PollDecision =
  | {action: "ignore"}
  | {action: "retry"}
  | {action: "apply-and-continue"; job: JobView}
  | {action: "apply-and-stop"; job: JobView}
  | {action: "stop-error"; job?: JobView; error: string}
  | {action: "stop-timeout"; job?: JobView; error: string};

export function isTerminalJobStatus(status?: string | null): boolean {
  return !!status && TERMINAL_JOB_STATUSES.has(status);
}

export function isInFlightJobStatus(status?: string | null): boolean {
  return !!status && IN_FLIGHT_JOB_STATUSES.has(status);
}

export function normalizeLatestJob(raw: unknown): BiweeklyLatestJob | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const job_id = typeof row.job_id === "string" ? row.job_id.trim() : "";
  const status = typeof row.status === "string" ? row.status.trim() : "";
  if (!job_id || !status) return null;
  const latest: BiweeklyLatestJob = {job_id, status};
  if (typeof row.created_at === "string") latest.created_at = row.created_at;
  if (typeof row.reference === "boolean") latest.reference = row.reference;
  return latest;
}

export function jobFromLatest(raw: unknown): JobView | null {
  const latest = normalizeLatestJob(raw);
  if (!latest) return null;
  const job: JobView = {job_id: latest.job_id, status: latest.status};
  if (latest.created_at) job.created_at = latest.created_at;
  if (typeof latest.reference === "boolean") job.reference = latest.reference;
  return job;
}

function pickArtifact(raw: unknown): BiweeklyJobArtifact | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const artifact: BiweeklyJobArtifact = {};
  if (typeof row.path === "string") artifact.path = row.path;
  if (typeof row.filename === "string") artifact.filename = row.filename;
  if (typeof row.mime === "string") artifact.mime = row.mime;
  if (typeof row.sha256 === "string") artifact.sha256 = row.sha256;
  if (typeof row.size_bytes === "number") artifact.size_bytes = row.size_bytes;
  if (typeof row.kind === "string") artifact.kind = row.kind;
  return Object.keys(artifact).length ? artifact : null;
}

export function jobFromApi(raw: unknown): JobView | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const job_id = typeof row.job_id === "string" ? row.job_id : undefined;
  const status = typeof row.status === "string" ? row.status : undefined;
  if (!job_id && !status) return null;
  const job: JobView = {};
  if (job_id) job.job_id = job_id;
  if (status) job.status = status;
  if (typeof row.kind === "string") job.kind = row.kind;
  if (typeof row.error === "string") job.error = row.error;
  if (typeof row.error_code === "string" || row.error_code === null) job.error_code = row.error_code as string | null;
  if (typeof row.dispatched_to_production === "boolean") job.dispatched_to_production = row.dispatched_to_production;
  if (typeof row.created_at === "string") job.created_at = row.created_at;
  if (typeof row.updated_at === "string") job.updated_at = row.updated_at;
  if (typeof row.reference === "boolean") job.reference = row.reference;
  if ("artifact" in row) job.artifact = pickArtifact(row.artifact);
  if (row.result && typeof row.result === "object") job.result = row.result as JobView["result"];
  return job;
}

export function clientFailedJob(message: string): JobView {
  return {status: "failed", error: message};
}

/** Official download needs status ready|evidence_limited and a stored artifact.path. */
export function hasPersistedArtifact(job?: JobView | null): boolean {
  const path = job?.artifact?.path;
  return typeof path === "string" && path.length > 0;
}

/**
 * ready: offer an authenticated download for job_id; do not require pack_pdf, snapshot, or artifactUrl.
 * evidence_limited: only if GET job (or an equivalent payload) proves a persisted artifact.
 */
export function canDownloadBiweeklyJob(job?: JobView | null): boolean {
  if (!job?.job_id) return false;
  if (job.status === "registration_pending") return false;
  if (job.status === "ready") return true;
  if (job.status === "evidence_limited") return hasPersistedArtifact(job);
  return false;
}

export function isGenerateInFlight(job?: JobView | null): boolean {
  if (!isInFlightJobStatus(job?.status)) return false;
  if (job?.kind === "backfill" || job?.kind === "backfill_season") return false;
  return true;
}

export function mergeJob(base: JobView | null | undefined, overlay: JobView | null | undefined): JobView | null {
  if (!base && !overlay) return null;
  if (!base) return overlay ? {...overlay} : null;
  if (!overlay) return {...base};
  const merged: JobView = {...base, ...overlay};
  if (overlay.artifact === undefined) merged.artifact = base.artifact;
  if (overlay.result === undefined) merged.result = base.result;
  if (overlay.error === undefined) merged.error = base.error;
  if (overlay.error_code === undefined) merged.error_code = base.error_code;
  return merged;
}

/**
 * Resolve the job to show for the current period.
 * trackedJobId is the generate job started in this tab for this period; it wins over a stale ready latest_job.
 */
export function selectPeriodJob(input: {
  periodLatest?: unknown;
  localJob?: JobView | null;
  trackedJobId?: string | null;
}): JobView | null {
  const fromPeriod = jobFromLatest(input.periodLatest);
  const local = input.localJob ?? null;
  const tracked = input.trackedJobId || null;

  if (tracked) {
    const localMatches = local?.job_id === tracked;
    const periodMatches = fromPeriod?.job_id === tracked;
    if (localMatches && periodMatches) return mergeJob(fromPeriod, local);
    if (localMatches) return local;
    if (periodMatches) return mergeJob(fromPeriod, local?.job_id === tracked ? local : null);
  }

  if (fromPeriod && local?.job_id === fromPeriod.job_id) return mergeJob(fromPeriod, local);
  if (fromPeriod) return fromPeriod;
  if (local && !local.job_id && local.status === "failed") return local;
  return null;
}

export function samePollScope(request: PollScope, current: PollScope): boolean {
  return (
    request.generation === current.generation &&
    request.landId === current.landId &&
    request.periodId === current.periodId &&
    request.jobId === current.jobId
  );
}

export function decidePollTick(input: {
  request: PollScope;
  current: PollScope;
  cancelled?: boolean;
  response?: unknown;
  error?: string;
  attempts: number;
  consecutiveErrors: number;
  maxAttempts?: number;
  maxConsecutiveErrors?: number;
}): PollDecision {
  if (input.cancelled || !samePollScope(input.request, input.current)) {
    return {action: "ignore"};
  }
  const maxAttempts = input.maxAttempts ?? POLL_MAX_ATTEMPTS;
  const maxErrors = input.maxConsecutiveErrors ?? POLL_MAX_CONSECUTIVE_ERRORS;

  if (input.error) {
    const errors = input.consecutiveErrors + 1;
    const job = jobFromApi(input.response);
    if (errors >= maxErrors || input.attempts >= maxAttempts) {
      return {action: "stop-error", job: job ?? undefined, error: input.error};
    }
    return {action: "retry"};
  }

  const job = jobFromApi(input.response);
  if (!job) {
    if (input.attempts >= maxAttempts) {
      return {action: "stop-timeout", error: "仍在生成，已停止自动刷新。请稍后刷新页面。"};
    }
    return {action: "retry"};
  }

  if (isTerminalJobStatus(job.status)) {
    return {action: "apply-and-stop", job};
  }
  if (input.attempts >= maxAttempts) {
    return {
      action: "stop-timeout",
      job,
      error: "仍在生成，已停止自动刷新。请稍后刷新页面。",
    };
  }
  return {action: "apply-and-continue", job};
}

export function jobRegistrationNote(job?: JobView | null): string | undefined {
  if (job?.status === "registration_pending") return REGISTRATION_PENDING_NOTE;
  return undefined;
}

export function jobStatusPreview(job: JobView): Record<string, unknown> {
  return {
    status: job.status,
    job_id: job.job_id,
    error: job.error,
    error_code: job.error_code,
    note: jobRegistrationNote(job),
    dispatched_to_production: job.dispatched_to_production,
    phase: job.result?.phase,
    planned_batch: job.result?.planned_batch,
    brief: job.result?.brief,
  };
}
