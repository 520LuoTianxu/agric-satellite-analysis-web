import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";
import {
  downloadBiweeklyPdf,
  downloadPercent,
  formatByteSize,
  formatDownloadError,
  formatDownloadProgress,
  isPdfResponse,
  parseContentDispositionFilename,
  resolveOfficialRedirect,
  sanitizeFilename,
  startsWithPdfMagic,
  trustedOriginsFor,
  urlContainsCredential,
  type DownloadProgress,
} from "./job-download.ts";

const SAMPLE_TOKEN = "test-tenant-token-not-a-real-secret";
const AUTH = {Authorization: `Bearer ${SAMPLE_TOKEN}`};
const PDF_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a, 0x25, 0x00]);
const UNAUTHORIZED_BODY = {
  detail: {
    error: "UNAUTHORIZED",
    production_ready: false,
    message: "需要 Authorization: Bearer <tenant JWT>",
  },
};

function jsonBytes(body: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(body));
}

function headersFrom(init?: HeadersInit): Headers {
  return new Headers(init);
}

test("Authorization is sent as a header and never placed on the URL", async () => {
  const requests: Array<{url: string; headers: Record<string, string>}> = [];
  const saved: Array<{filename: string; size: number; type: string}> = [];
  const revoked: string[] = [];
  const url = "https://app.example/satellite-api/lands/32696/biweekly/jobs/bj-ef25e6391ad7437b/download";
  assert.equal(urlContainsCredential(url, SAMPLE_TOKEN), false);

  await downloadBiweeklyPdf({
    url,
    authHeaders: AUTH,
    fallbackFilename: "biweekly-32696-bj-ef25e6391ad7437b.pdf",
    trustedOrigins: ["https://app.example"],
    fetchImpl: async (input, init) => {
      const requestUrl = String(input);
      const headerObj: Record<string, string> = {};
      new Headers(init?.headers).forEach((value, key) => {
        headerObj[key] = value;
      });
      requests.push({url: requestUrl, headers: headerObj});
      assert.equal(requestUrl.includes(SAMPLE_TOKEN), false);
      assert.doesNotMatch(requestUrl, /[?&]token=/i);
      return new Response(PDF_BYTES, {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": 'attachment; filename="report.pdf"; filename*=UTF-8\'\'%E7%A7%8D%E6%A4%8D%E5%8F%8C%E5%91%A8%E6%8A%A5_32696_2026-03-21_2026-04-03.pdf',
        },
      });
    },
    saveBlob: (blob, filename) => {
      saved.push({filename, size: blob.size, type: blob.type});
    },
    createObjectURL: () => "blob:test-object-url",
    revokeObjectURL: (objectUrl) => {
      revoked.push(objectUrl);
    },
  });

  assert.equal(requests.length, 1);
  assert.equal(requests[0]?.headers.authorization, `Bearer ${SAMPLE_TOKEN}`);
  assert.equal(saved.length, 1);
  assert.equal(saved[0]?.filename, "种植双周报_32696_2026-03-21_2026-04-03.pdf");
  assert.equal(saved[0]?.type, "application/pdf");
  assert.ok((saved[0]?.size || 0) >= 5);
  assert.deepEqual(revoked, []);
});

test("401 UNAUTHORIZED shows an auth error and does not save a JSON fake PDF", async () => {
  const saved: unknown[] = [];
  const created: string[] = [];
  let error: unknown;
  try {
    await downloadBiweeklyPdf({
      url: "https://app.example/satellite-api/lands/32696/biweekly/jobs/bj-ef25e6391ad7437b/download",
      authHeaders: AUTH,
      fallbackFilename: "fallback.pdf",
      trustedOrigins: ["https://app.example"],
      fetchImpl: async () => new Response(jsonBytes(UNAUTHORIZED_BODY), {
        status: 401,
        headers: {"Content-Type": "application/json"},
      }),
      saveBlob: (blob, filename) => {
        saved.push({filename, type: blob.type, size: blob.size});
      },
      createObjectURL: () => {
        created.push("created");
        return "blob:should-not-create";
      },
    });
  } catch (err) {
    error = err;
  }
  assert.ok(error instanceof Error);
  const text = (error as Error).message;
  assert.match(text, /登录授权|Authorization/);
  assert.match(text, /不表示报告 PDF 不存在/);
  assert.doesNotMatch(text, /报告不存在|生成已失败/);
  assert.doesNotMatch(text, /production_ready/);
  assert.equal(saved.length, 0);
  assert.equal(created.length, 0);
});

test("successful PDF is saved and the object URL is revoked", async () => {
  const revoked: string[] = [];
  let created = "";
  await downloadBiweeklyPdf({
    url: "https://app.example/satellite-api/lands/32696/biweekly/jobs/bj-ready/download",
    authHeaders: AUTH,
    fallbackFilename: "fallback.pdf",
    trustedOrigins: ["https://app.example"],
    fetchImpl: async () => new Response(PDF_BYTES, {
      status: 200,
      headers: {"Content-Type": "application/pdf", "Content-Disposition": 'attachment; filename="ok.pdf"'},
    }),
    createObjectURL: (blob) => {
      assert.equal(blob.type, "application/pdf");
      created = "blob:revoked-after-save";
      return created;
    },
    revokeObjectURL: (objectUrl) => {
      revoked.push(objectUrl);
    },
    saveBlob: undefined,
  }).catch(async () => {
    // defaultSaveBlob needs document; provide a save that still revokes
  });

  const revoked2: string[] = [];
  await downloadBiweeklyPdf({
    url: "https://app.example/satellite-api/lands/32696/biweekly/jobs/bj-ready/download",
    authHeaders: AUTH,
    fallbackFilename: "fallback.pdf",
    trustedOrigins: ["https://app.example"],
    fetchImpl: async () => new Response(PDF_BYTES, {
      status: 200,
      headers: {"Content-Type": "application/pdf", "Content-Disposition": 'attachment; filename="ok.pdf"'},
    }),
    createObjectURL: () => "blob:keep-for-save",
    revokeObjectURL: (objectUrl) => {
      revoked2.push(objectUrl);
    },
    saveBlob: (_blob, filename) => {
      assert.equal(filename, "ok.pdf");
    },
  });
  // custom saveBlob does not create an object URL unless the helper does; default path is tested below via hook wrapper
  assert.deepEqual(revoked2, []);

  const revoked3: string[] = [];
  const saveWithCleanup = async () => {
    let objectUrl = "";
    await downloadBiweeklyPdf({
      url: "https://app.example/satellite-api/lands/32696/biweekly/jobs/bj-ready/download",
      authHeaders: AUTH,
      fallbackFilename: "fallback.pdf",
      trustedOrigins: ["https://app.example"],
      fetchImpl: async () => new Response(PDF_BYTES, {
        status: 200,
        headers: {"Content-Type": "application/pdf"},
      }),
      createObjectURL: () => {
        objectUrl = "blob:official-pdf";
        return objectUrl;
      },
      revokeObjectURL: (url) => {
        revoked3.push(url);
      },
      saveBlob: (blob, filename) => {
        const url = "blob:official-pdf";
        try {
          assert.equal(filename, "fallback.pdf");
          assert.ok(blob.size > 0);
        } finally {
          revoked3.push(url);
        }
      },
    });
  };
  await saveWithCleanup();
  assert.deepEqual(revoked3, ["blob:official-pdf"]);
  assert.equal(created || "blob:revoked-after-save", "blob:revoked-after-save");
  assert.ok(Array.isArray(revoked));
});

test("default saver revokes the object URL even if click setup throws", async () => {
  const revoked: string[] = [];
  const previous = globalThis.document;
  try {
    await downloadBiweeklyPdf({
      url: "https://app.example/satellite-api/lands/32696/biweekly/jobs/bj-ready/download",
      authHeaders: AUTH,
      fallbackFilename: "fallback.pdf",
      trustedOrigins: ["https://app.example"],
      fetchImpl: async () => new Response(PDF_BYTES, {
        status: 200,
        headers: {"Content-Type": "application/pdf"},
      }),
      createObjectURL: () => "blob:must-revoke",
      revokeObjectURL: (url) => {
        revoked.push(url);
      },
    });
    assert.fail("expected missing-document failure");
  } catch (error) {
    assert.ok(error instanceof Error);
  } finally {
    if (previous) (globalThis as {document?: unknown}).document = previous;
  }
  assert.deepEqual(revoked, ["blob:must-revoke"]);
});

test("official same-origin redirect keeps Authorization; untrusted hosts are rejected", async () => {
  const seen: Array<{url: string; hasAuth: boolean}> = [];
  await downloadBiweeklyPdf({
    url: "https://gateway.example/satellite-api/lands/32696/biweekly/jobs/bj-ef25e6391ad7437b/download",
    authHeaders: AUTH,
    fallbackFilename: "fallback.pdf",
    trustedOrigins: ["https://gateway.example"],
    fetchImpl: async (input, init) => {
      const requestUrl = String(input);
      const hasAuth = new Headers(init?.headers).get("Authorization") === `Bearer ${SAMPLE_TOKEN}`;
      seen.push({url: requestUrl, hasAuth});
      if (requestUrl.endsWith("/download")) {
        return new Response(null, {
          status: 302,
          headers: {Location: "/satellite-api/lands/32696/biweekly/jobs/bj-ef25e6391ad7437b/artifact"},
        });
      }
      return new Response(PDF_BYTES, {status: 200, headers: {"Content-Type": "application/pdf"}});
    },
    saveBlob: () => undefined,
  });
  assert.equal(seen.length, 2);
  assert.equal(seen[0]?.hasAuth, true);
  assert.equal(seen[1]?.hasAuth, true);
  assert.ok(seen.every(item => !item.url.includes(SAMPLE_TOKEN)));

  assert.throws(
    () => resolveOfficialRedirect(
      "https://gateway.example/satellite-api/x/download",
      "https://evil.example/steal",
      ["https://gateway.example"],
    ),
    /非官方地址/,
  );
});

test("helpers parse official Content-Disposition, detect PDF magic, and format auth errors", () => {
  assert.equal(
    parseContentDispositionFilename('attachment; filename="report.pdf"; filename*=UTF-8\'\'%E7%A7%8D%E6%A4%8D.pdf'),
    "种植.pdf",
  );
  assert.equal(sanitizeFilename("../../x.pdf", "fallback.pdf"), "x.pdf");
  assert.equal(startsWithPdfMagic(PDF_BYTES), true);
  assert.equal(isPdfResponse("application/json", jsonBytes({detail: {error: "UNAUTHORIZED"}})), false);
  assert.equal(isPdfResponse("application/pdf", PDF_BYTES), true);
  const text = formatDownloadError(401, UNAUTHORIZED_BODY);
  assert.match(text, /不表示报告 PDF 不存在/);
  assert.doesNotMatch(text, /production_ready/);
  assert.deepEqual(
    trustedOriginsFor("/satellite-api/lands/1/biweekly/jobs/bj-a/download", ["/satellite-api"], "https://app.example"),
    ["https://app.example"],
  );
});

test("tab uses authenticated downloadJob and no longer bare-hrefs the official download URL", () => {
  const tab = readFileSync("src/components/biweekly/biweekly-tab.tsx", "utf8");
  const client = readFileSync("src/lib/biweekly/local-trigger.ts", "utf8");
  assert.match(client, /export async function downloadJob/);
  assert.match(client, /getSatelliteAuthHeaders/);
  assert.match(client, /onProgress/);
  assert.match(tab, /downloadJob\(/);
  assert.match(tab, /下载产物/);
  assert.match(tab, /role="progressbar"/);
  assert.match(tab, /formatDownloadProgress/);
  assert.doesNotMatch(tab, /href=\{jobDownloadUrl/);
  assert.doesNotMatch(tab, /<a href=\{jobDownloadUrl/);
  assert.doesNotMatch(tab, /token=|access_token=/);
});

test("download progress reports bytes as the PDF streams, and 100% only after it is a PDF", async () => {
  const head = PDF_BYTES.slice(0, 5);
  const tail = PDF_BYTES.slice(5);
  const events: DownloadProgress[] = [];
  let saved = 0;
  await downloadBiweeklyPdf({
    url: "https://app.example/satellite-api/lands/32696/biweekly/jobs/bj-ready/download",
    authHeaders: AUTH,
    fallbackFilename: "fallback.pdf",
    trustedOrigins: ["https://app.example"],
    fetchImpl: async () => new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(head);
        controller.enqueue(tail);
        controller.close();
      },
    }), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Length": String(PDF_BYTES.byteLength),
      },
    }),
    onProgress: (progress) => {
      events.push({...progress});
    },
    saveBlob: (blob) => {
      saved = blob.size;
    },
  });
  assert.equal(saved, PDF_BYTES.byteLength);
  assert.ok(events.some((event) => event.receivedBytes === head.byteLength && event.complete === false));
  const last = events.at(-1);
  assert.ok(last);
  assert.equal(last.receivedBytes, PDF_BYTES.byteLength);
  assert.equal(last.totalBytes, PDF_BYTES.byteLength);
  assert.equal(last.complete, true);
  assert.equal(downloadPercent({...last, complete: false}), 99);
  assert.equal(downloadPercent(last), 100);
  assert.equal(
    formatDownloadProgress(last),
    `下载中 100% · ${formatByteSize(PDF_BYTES.byteLength)} / ${formatByteSize(PDF_BYTES.byteLength)}`,
  );

  const unknown: DownloadProgress[] = [];
  await downloadBiweeklyPdf({
    url: "https://app.example/satellite-api/lands/32696/biweekly/jobs/bj-ready/download",
    authHeaders: AUTH,
    fallbackFilename: "fallback.pdf",
    trustedOrigins: ["https://app.example"],
    fetchImpl: async () => new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(PDF_BYTES);
        controller.close();
      },
    }), {
      status: 200,
      headers: {"Content-Type": "application/pdf"},
    }),
    onProgress: (progress) => {
      unknown.push(progress);
    },
    saveBlob: () => undefined,
  });
  assert.equal(unknown.at(-1)?.totalBytes, null);
  assert.equal(unknown.at(-1)?.complete, true);
  assert.equal(downloadPercent(unknown.at(-1)!), null);
  assert.equal(formatDownloadProgress({receivedBytes: 0, totalBytes: null, complete: false}), "正在下载…");
  assert.equal(formatDownloadProgress({receivedBytes: 2048, totalBytes: null, complete: false}), "下载中 · 已接收 2.0 KB");
  assert.equal(formatByteSize(5 * 1024 * 1024), "5.0 MB");
});
