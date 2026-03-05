import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const MOCK_TOKEN = "fake-firebase-id-token";

const authStub = vi.hoisted(() => ({
  currentUser: null as { getIdToken: () => Promise<string> } | null,
}));

vi.mock("../lib/firebase", () => ({
  auth: authStub,
}));

describe("apiFetch", () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    authStub.currentUser = null;
    globalThis.fetch = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    process.env = originalEnv;
  });

  it("uses default API URL when NEXT_PUBLIC_API_URL is not set", async () => {
    delete process.env.NEXT_PUBLIC_API_URL;
    const { apiFetch } = await import("../lib/api");
    await apiFetch("/api/workflows");
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "http://localhost:8000/api/workflows",
      expect.any(Object)
    );
  });

  it("uses NEXT_PUBLIC_API_URL when set", async () => {
    process.env.NEXT_PUBLIC_API_URL = "https://api.example.com";
    const { apiFetch } = await import("../lib/api");
    await apiFetch("/health");
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://api.example.com/health",
      expect.any(Object)
    );
  });

  it("adds Authorization header when auth.currentUser exists", async () => {
    authStub.currentUser = {
      getIdToken: vi.fn().mockResolvedValue(MOCK_TOKEN),
    };
    const { apiFetch } = await import("../lib/api");
    await apiFetch("/api/workflows");
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: `Bearer ${MOCK_TOKEN}`,
        }),
      })
    );
  });

  it("does not add Authorization header when auth.currentUser is null", async () => {
    authStub.currentUser = null;
    const { apiFetch } = await import("../lib/api");
    await apiFetch("/api/workflows");
    const call = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const headers = call[1]?.headers as Record<string, string>;
    expect(headers?.Authorization).toBeUndefined();
  });

  it("passes through custom headers and options", async () => {
    const { apiFetch } = await import("../lib/api");
    await apiFetch("/api/workflows", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "test" }),
    });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ name: "test" }),
      })
    );
  });

  it("returns the Response from fetch", async () => {
    const mockResponse = new Response('{"ok":true}', { status: 200 });
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse);
    const { apiFetch } = await import("../lib/api");
    const result = await apiFetch("/health");
    expect(result).toBe(mockResponse);
    expect(result.status).toBe(200);
  });
});
