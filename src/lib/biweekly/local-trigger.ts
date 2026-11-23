/** Client for API-machine biweekly routes via the same satellite gateway.

Default path is getApiBase() + /lands/{id}/biweekly/* (Caddy maps
/satellite-api to /v1). Auth is the existing login-state Bearer from
getSatelliteAuthHeaders(), not a standalone NEXT_PUBLIC_BIWEEKLY_JWT
as the only path. Optional NEXT_PUBLIC_BIWEEKLY_API_BASE is an escape
hatch for a raw API process; it must not default to a production domain.
*/
import { biweeklyApi, getApiBase, getSatelliteAuthHeaders } from "@/lib/api";

export const DEFAULT_API_BASE = "/satellite-api";

function localFixtureEnabled(): boolean {
  return (
    typeof process !== "undefined" &&
    process.env.NEXT_PUBLIC_BIWEEKLY_LOCAL_FIXTURE === "1"
  );
}

export function usesLocalFixture(): boolean {
  return localFixtureEnabled();
}

export function biweeklyRequestBase(): string {
  const override =
    typeof process !== "undefined" ? process.env.NEXT_PUBLIC_BIWEEKLY_API_BASE : "";
  if (override && override.trim()) {
    return override.replace(/\/$/, "");
  }
  return getApiBase();
}

export function biweeklyPath(landPath: string): string {
  const base = biweeklyRequestBase();
  const path = landPath.startsWith("/") ? landPath : `/${landPath}`;
  if (base.includes("/satellite-api") || base.endsWith("/v1")) {
    return `${base}${path}`;
  }
  // Raw uvicorn app.main / biweekly_dev_app listens on /v1.
  return `${base}/v1${path}`;
}

export function triggerBackfill(landId: string, seasonId: string, periodId: string) {
  if (!process.env.NEXT_PUBLIC_BIWEEKLY_API_BASE) {
    return biweeklyApi.backfill(landId, seasonId, periodId);
  }
  return call(biweeklyPath(`/lands/${landId}/biweekly/periods/${periodId}/backfill?season=${encodeURIComponent(seasonId)}`), "POST", {});
}

export function triggerBackfillSeason(landId: string, seasonId: string) {
  if (!process.env.NEXT_PUBLIC_BIWEEKLY_API_BASE) {
    return biweeklyApi.backfillSeason(landId, seasonId);
  }
  return call(
    biweeklyPath(`/lands/${landId}/biweekly/backfill-season?season=${encodeURIComponent(seasonId)}`),
    "POST",
    {season: seasonId},
  );
}

export function triggerGenerate(landId: string, seasonId: string, periodId: string, referencePlantingInstanceId?: string) {
  if (!process.env.NEXT_PUBLIC_BIWEEKLY_API_BASE) {
    return biweeklyApi.generate(landId, seasonId, periodId, referencePlantingInstanceId);
  }
  const body = referencePlantingInstanceId ? {reference_planting_instance_id: referencePlantingInstanceId} : {};
  return call(biweeklyPath(`/lands/${landId}/biweekly/periods/${periodId}/generate?season=${encodeURIComponent(seasonId)}`), "POST", body);
}

export function listSeasons(landId: string, signal?: AbortSignal) {
  if (!process.env.NEXT_PUBLIC_BIWEEKLY_API_BASE) {
    return biweeklyApi.seasons(landId, signal);
  }
  return call(biweeklyPath(`/lands/${landId}/biweekly/seasons`), "GET", undefined, signal);
}

export function listPeriods(landId: string, seasonId: string, signal?: AbortSignal) {
  if (!process.env.NEXT_PUBLIC_BIWEEKLY_API_BASE) {
    return biweeklyApi.periods(landId, seasonId, signal);
  }
  return call(biweeklyPath(`/lands/${landId}/biweekly/periods?season=${encodeURIComponent(seasonId)}`), "GET", undefined, signal);
}

export function getJob(landId: string, jobId: string, signal?: AbortSignal) {
  if (!process.env.NEXT_PUBLIC_BIWEEKLY_API_BASE) {
    return biweeklyApi.job(landId, jobId, signal);
  }
  return call(biweeklyPath(`/lands/${landId}/biweekly/jobs/${jobId}`), "GET", undefined, signal);
}

export function jobDownloadUrl(landId: string, jobId: string) {
  if (!process.env.NEXT_PUBLIC_BIWEEKLY_API_BASE) {
    return biweeklyApi.downloadUrl(landId, jobId);
  }
  return biweeklyPath(`/lands/${landId}/biweekly/jobs/${jobId}/download`);
}

async function call(url: string, method: "GET" | "POST", body?: unknown, signal?: AbortSignal): Promise<unknown> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...getSatelliteAuthHeaders(),
  };
  const devJwt = typeof process !== "undefined" && localFixtureEnabled()
    ? process.env.NEXT_PUBLIC_BIWEEKLY_JWT
    : "";
  if (devJwt && !headers.Authorization) headers.Authorization = `Bearer ${devJwt}`;
  const response = await fetch(url, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
  });
  const text = await response.text();
  let data: unknown = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = {error: "INVALID_RESPONSE", raw: text}; }
  if (!response.ok) {
    const detail = data && typeof data === "object" && data !== null && "detail" in data
      ? (data as {detail?: {error?: string} | string}).detail
      : undefined;
    const fromDetail = detail && typeof detail === "object" && detail.error ? detail.error : undefined;
    const err = fromDetail
      || (data && typeof data === "object" && "error" in data ? String((data as {error: string}).error) : `HTTP_${response.status}`);
    throw new Error(err);
  }
  return data;
}

/** @deprecated Use biweeklyRequestBase(). */
export const apiBase = biweeklyRequestBase;
export const localApiBase = biweeklyRequestBase;
export const DEFAULT_LOCAL_API = DEFAULT_API_BASE;
