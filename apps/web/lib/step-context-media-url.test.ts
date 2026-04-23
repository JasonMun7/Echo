import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn(),
}));

import {
  isFirebaseStorageDownloadUrl,
  logContextMediaHttpError,
  shouldProxyStepContextMediaUrl,
} from "./step-context-media-url";

describe("isFirebaseStorageDownloadUrl", () => {
  it("accepts typical Firebase download URLs", () => {
    const u =
      "https://firebasestorage.googleapis.com/v0/b/myapp.appspot.com/o/users%2Fa.png?alt=media&token=abc";
    expect(isFirebaseStorageDownloadUrl(u)).toBe(true);
  });

  it("accepts token-based object URLs", () => {
    const u = "https://firebasestorage.googleapis.com/v0/b/x/o/path%2Ffile.jpg?token=xyz";
    expect(isFirebaseStorageDownloadUrl(u)).toBe(true);
  });

  it("rejects non-Firebase hosts or missing path/query hints", () => {
    expect(isFirebaseStorageDownloadUrl("https://cdn.example.com/o/file.png?token=1")).toBe(false);
    expect(
      isFirebaseStorageDownloadUrl(
        "https://firebasestorage.googleapis.com/v0/b/x/bad/no-o-segment?token=1",
      ),
    ).toBe(false);
  });

  it("trims whitespace and rejects malformed URLs", () => {
    expect(isFirebaseStorageDownloadUrl("  not a url  ")).toBe(false);
  });
});

describe("shouldProxyStepContextMediaUrl", () => {
  it("returns false for empty, blob, and data URLs", () => {
    expect(shouldProxyStepContextMediaUrl("")).toBe(false);
    expect(shouldProxyStepContextMediaUrl("   ")).toBe(false);
    expect(shouldProxyStepContextMediaUrl("blob:http://localhost/x")).toBe(false);
    expect(shouldProxyStepContextMediaUrl("data:image/png;base64,xxx")).toBe(false);
  });

  it("proxies gs:// and arbitrary strings that are not valid http(s)", () => {
    expect(shouldProxyStepContextMediaUrl("gs://bucket/obj")).toBe(true);
    expect(shouldProxyStepContextMediaUrl("not-a-url")).toBe(true);
  });

  it("does not proxy Firebase Storage download URLs", () => {
    const u = "https://firebasestorage.googleapis.com/v0/b/x/o/y.png?alt=media&token=z";
    expect(shouldProxyStepContextMediaUrl(u)).toBe(false);
  });

  it("proxies Google Cloud Storage hosts", () => {
    expect(
      shouldProxyStepContextMediaUrl(
        "https://storage.googleapis.com/my-bucket/screenshot.png?X-Goog-Signature=1",
      ),
    ).toBe(true);
    expect(
      shouldProxyStepContextMediaUrl("https://storage.cloud.google.com/my-bucket/screenshot.png"),
    ).toBe(true);
    expect(shouldProxyStepContextMediaUrl("https://my-bucket.storage.googleapis.com/key.jpg")).toBe(
      true,
    );
  });

  it("proxies www.googleapis.com storage API paths", () => {
    expect(
      shouldProxyStepContextMediaUrl(
        "https://www.googleapis.com/storage/v1/b/bucket/o/file%2Fpic.png?alt=media",
      ),
    ).toBe(true);
    expect(
      shouldProxyStepContextMediaUrl("https://www.googleapis.com/download/storage/v1/b/bucket/o/x"),
    ).toBe(true);
  });

  it("does not proxy generic HTTPS assets", () => {
    expect(shouldProxyStepContextMediaUrl("https://images.example.com/a.png")).toBe(false);
  });
});

describe("logContextMediaHttpError", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("logs status, request id, and JSON detail when body is JSON", () => {
    const res = new Response(null, {
      status: 502,
      headers: { "X-Echo-Request-Id": "req-123" },
    });
    logContextMediaHttpError("wf-1", res, JSON.stringify({ detail: "upstream failed" }));

    expect(console.warn).toHaveBeenCalledWith("[Echo context-media]", {
      workflowId: "wf-1",
      status: 502,
      requestId: "req-123",
      detail: "upstream failed",
    });
  });

  it("falls back to truncated text when body is not JSON", () => {
    const res = new Response(null, { status: 500 });
    const body = "plain error ".repeat(100);
    logContextMediaHttpError("wf-2", res, body);

    expect(console.warn).toHaveBeenCalledWith(
      "[Echo context-media]",
      expect.objectContaining({
        workflowId: "wf-2",
        status: 500,
        detail: body.slice(0, 800),
      }),
    );
  });
});
