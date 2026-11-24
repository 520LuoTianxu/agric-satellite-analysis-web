/** Authenticated official biweekly PDF download. Never put the Bearer token in the URL, path, query, or logs. */

export const MAX_OFFICIAL_REDIRECTS = 5;

export interface DownloadProgress {
  receivedBytes: number;
  totalBytes: number | null;
  complete: boolean;
}

export interface DownloadAuthRequest {
  url: string;
  authHeaders: Record<string, string>;
  fallbackFilename: string;
  trustedOrigins: string[];
  signal?: AbortSignal;
  onProgress?: (progress: DownloadProgress) => void;
  fetchImpl?: typeof fetch;
  saveBlob?: (blob: Blob, filename: string) => void;
  createObjectURL?: (blob: Blob) => string;
  revokeObjectURL?: (url: string) => void;
}

export function contentLengthOf(headers: { get(name: string): string | null }): number | null {
  const raw = headers.get("Content-Length")?.trim() ?? "";
  if (!/^\d+$/.test(raw)) return null;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return null;
  return value;
}

export function formatByteSize(bytes: number): string {
  const size = Math.max(0, Math.round(bytes));
  if (size < 1024) return `${size} B`;
  const kb = size / 1024;
  if (kb < 1024) return `${kb.toFixed(kb >= 100 ? 0 : 1)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

/** Percent stays below 100 until the body has been validated. Unknown length has no percent. */
export function downloadPercent(progress: DownloadProgress): number | null {
  if (progress.totalBytes == null || progress.totalBytes <= 0) return null;
  if (progress.complete) return 100;
  return Math.min(99, Math.floor((progress.receivedBytes / progress.totalBytes) * 100));
}

export function formatDownloadProgress(progress: DownloadProgress): string {
  if (!progress.complete && progress.receivedBytes <= 0 && progress.totalBytes == null) {
    return "正在下载…";
  }
  const received = formatByteSize(progress.receivedBytes);
  const percent = downloadPercent(progress);
  if (percent != null && progress.totalBytes != null) {
    return `下载中 ${percent}% · ${received} / ${formatByteSize(progress.totalBytes)}`;
  }
  return `下载中 · 已接收 ${received}`;
}

export function sanitizeFilename(name: string, fallback: string): string {
  const trimmed = name.replace(/\\/g, "/").split("/").pop()?.trim() || "";
  const cleaned = trimmed.replace(/[\u0000-\u001f\u007f]/g, "").replace(/[<>:"|?*]/g, "");
  if (!cleaned || cleaned === "." || cleaned === "..") return fallback;
  return cleaned;
}

export function parseContentDispositionFilename(header: string | null | undefined): string | null {
  if (!header) return null;
  const star = /filename\*\s*=\s*(?:UTF-8''|utf-8'')([^;]+)/i.exec(header);
  if (star?.[1]) {
    try {
      return decodeURIComponent(star[1].trim().replace(/^"(.*)"$/, "$1"));
    } catch {
      return star[1].trim();
    }
  }
  const quoted = /filename\s*=\s*"([^"]+)"/i.exec(header);
  if (quoted?.[1]) return quoted[1];
  const bare = /filename\s*=\s*([^;]+)/i.exec(header);
  if (bare?.[1]) return bare[1].trim().replace(/^"(.*)"$/, "$1");
  return null;
}

export function startsWithPdfMagic(bytes: Uint8Array): boolean {
  return bytes.length >= 5
    && bytes[0] === 0x25
    && bytes[1] === 0x50
    && bytes[2] === 0x44
    && bytes[3] === 0x46
    && bytes[4] === 0x2d;
}

export function looksLikeJsonBytes(bytes: Uint8Array): boolean {
  let i = 0;
  while (i < bytes.length && (bytes[i] === 0x20 || bytes[i] === 0x0a || bytes[i] === 0x0d || bytes[i] === 0x09)) i += 1;
  const c = bytes[i];
  return c === 0x7b || c === 0x5b;
}

export function isPdfResponse(contentType: string | null | undefined, bytes: Uint8Array): boolean {
  if (startsWithPdfMagic(bytes)) return true;
  const type = (contentType || "").toLowerCase();
  return type.includes("application/pdf") && !looksLikeJsonBytes(bytes);
}

function decodeText(bytes: Uint8Array): string {
  return new TextDecoder("utf-8").decode(bytes);
}

function parseJsonBody(bytes: Uint8Array): unknown {
  try {
    return JSON.parse(decodeText(bytes));
  } catch {
    return null;
  }
}

function detailRecord(body: unknown): Record<string, unknown> | null {
  if (!body || typeof body !== "object") return null;
  const row = body as Record<string, unknown>;
  if (row.detail && typeof row.detail === "object") return row.detail as Record<string, unknown>;
  return row;
}

/** Visible error text. Never treat UNAUTHORIZED or production_ready:false as "PDF missing" or report failure. */
export function formatDownloadError(status: number, body: unknown): string {
  const detail = detailRecord(body);
  const code = typeof detail?.error === "string" ? detail.error : typeof (body as {error?: unknown})?.error === "string" ? (body as {error: string}).error : "";
  const message = typeof detail?.message === "string" ? detail.message : "";
  if (status === 401 || status === 403 || code === "UNAUTHORIZED" || code === "ACCESS_DENIED") {
    return "下载需要登录授权。请在已登录的双周报页面使用「下载产物」，不要在浏览器地址栏直接打开下载链接（裸链接不会带 Authorization）。这不表示报告 PDF 不存在，也不表示生成失败。";
  }
  if (code === "ARTIFACT_UNAVAILABLE" || status === 409) {
    return message && !/production_ready/i.test(message) ? message : "当前任务没有可下载的报告文件。";
  }
  if (code && code !== "UNAUTHORIZED") {
    return message ? `${code}：${message}` : `下载失败（${code}）。`;
  }
  if (status) return `下载失败（HTTP ${status}）。`;
  return "下载失败。";
}

export function originOf(url: string, pageOrigin?: string): string | null {
  try {
    return new URL(url, pageOrigin || "http://localhost").origin;
  } catch {
    return null;
  }
}

export function trustedOriginsFor(downloadUrl: string, apiBases: Array<string | undefined>, pageOrigin?: string): string[] {
  const origins = new Set<string>();
  const add = (value?: string) => {
    if (!value) return;
    if (value.startsWith("/") && pageOrigin) {
      origins.add(pageOrigin);
      return;
    }
    const origin = originOf(value, pageOrigin);
    if (origin && origin !== "null") origins.add(origin);
  };
  add(downloadUrl);
  for (const base of apiBases) add(base);
  if (pageOrigin) origins.add(pageOrigin);
  return [...origins];
}

export function resolveOfficialRedirect(
  requestUrl: string,
  location: string | null,
  trustedOrigins: string[],
  pageOrigin?: string,
): {url: string; sendAuth: boolean} {
  if (!location || !location.trim()) {
    throw new Error("下载重定向缺少 Location。");
  }
  let next: URL;
  try {
    next = new URL(location, requestUrl.startsWith("/") && pageOrigin ? pageOrigin + requestUrl : requestUrl);
  } catch {
    throw new Error("下载重定向地址无效。");
  }
  if (next.username || next.password) {
    throw new Error("已中止下载：重定向地址含有用户信息。");
  }
  const trusted = new Set(trustedOrigins);
  if (!trusted.has(next.origin)) {
    throw new Error("下载被重定向到非官方地址，已中止，以免把登录凭据发到外部站点。");
  }
  return {url: next.href, sendAuth: true};
}

export function urlContainsCredential(url: string, token: string): boolean {
  if (!token) return false;
  const trimmed = token.replace(/^Bearer\s+/i, "");
  if (!trimmed) return false;
  return url.includes(trimmed);
}

function authHeaderMap(headers: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (!key) continue;
    if (key.toLowerCase() === "authorization" && value) {
      const token = value.replace(/^Bearer\s+/i, "").trim();
      if (token) out.Authorization = `Bearer ${token}`;
      continue;
    }
    if (key.toLowerCase() === "content-type") continue;
    out[key] = value;
  }
  return out;
}

async function readBody(
  response: Response,
  onProgress?: (progress: DownloadProgress) => void,
): Promise<{ bytes: Uint8Array; totalBytes: number | null }> {
  const totalBytes = contentLengthOf(response.headers);
  const report = (receivedBytes: number) => {
    onProgress?.({ receivedBytes, totalBytes, complete: false });
  };
  const body = response.body;
  if (!body || typeof body.getReader !== "function") {
    const bytes = new Uint8Array(await response.arrayBuffer());
    report(bytes.byteLength);
    return { bytes, totalBytes };
  }
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  report(0);
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value || value.byteLength === 0) continue;
      chunks.push(value.slice());
      received += value.byteLength;
      report(received);
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  }
  const bytes = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { bytes, totalBytes };
}

function defaultSaveBlob(
  blob: Blob,
  filename: string,
  createObjectURL: (blob: Blob) => string,
  revokeObjectURL: (url: string) => void,
): void {
  const objectUrl = createObjectURL(blob);
  try {
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    revokeObjectURL(objectUrl);
  }
}

export async function downloadBiweeklyPdf(input: DownloadAuthRequest): Promise<void> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const createObjectURL = input.createObjectURL ?? ((blob: Blob) => URL.createObjectURL(blob));
  const revokeObjectURL = input.revokeObjectURL ?? ((url: string) => URL.revokeObjectURL(url));
  const save = input.saveBlob ?? ((blob: Blob, filename: string) => defaultSaveBlob(blob, filename, createObjectURL, revokeObjectURL));
  const headers = authHeaderMap(input.authHeaders);
  const token = (headers.Authorization || "").replace(/^Bearer\s+/i, "");
  if (urlContainsCredential(input.url, token)) {
    throw new Error("下载地址不能包含登录凭据。");
  }

  let currentUrl = input.url;
  let sendAuth = true;
  for (let i = 0; i <= MAX_OFFICIAL_REDIRECTS; i += 1) {
    const requestHeaders = sendAuth ? headers : {};
    const response = await fetchImpl(currentUrl, {
      method: "GET",
      headers: requestHeaders,
      redirect: "manual",
      signal: input.signal,
      credentials: "same-origin",
    });
    if (response.type === "opaqueredirect") {
      throw new Error("下载重定向无法安全校验，已中止。");
    }
    if (response.status >= 300 && response.status < 400) {
      const next = resolveOfficialRedirect(currentUrl, response.headers.get("Location"), input.trustedOrigins);
      if (urlContainsCredential(next.url, token)) {
        throw new Error("下载地址不能包含登录凭据。");
      }
      currentUrl = next.url;
      sendAuth = next.sendAuth;
      continue;
    }

    const { bytes, totalBytes } = await readBody(response, input.onProgress);
    if (!response.ok) {
      const body = looksLikeJsonBytes(bytes) ? parseJsonBody(bytes) : null;
      throw new Error(formatDownloadError(response.status, body));
    }
    if (!isPdfResponse(response.headers.get("Content-Type"), bytes)) {
      const body = looksLikeJsonBytes(bytes) ? parseJsonBody(bytes) : null;
      if (body) throw new Error(formatDownloadError(response.status, body));
      throw new Error("下载结果不是 PDF，未保存文件。这不一定表示报告不存在，请稍后在已登录页面重试。");
    }
    input.onProgress?.({ receivedBytes: bytes.byteLength, totalBytes, complete: true });
    const filename = sanitizeFilename(
      parseContentDispositionFilename(response.headers.get("Content-Disposition")) || input.fallbackFilename,
      input.fallbackFilename,
    );
    // 流式读取得到的 Uint8Array 在当前 DOM 类型里不能直接作为 BlobPart。
    const copy = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(copy).set(bytes);
    save(new Blob([copy], {type: "application/pdf"}), filename);
    return;
  }
  throw new Error("下载重定向次数过多，已中止。");
}
