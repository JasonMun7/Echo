import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("./firebase", () => ({ auth: null }));
vi.mock("@/stores", () => ({
  useAuthStore: { getState: () => ({ getIdToken: vi.fn(async () => null) }) },
}));

import { apiErrorMessage } from "@/lib/api";

function jsonResponse(body: unknown, status = 400, statusText = "Bad Request") {
  return new Response(JSON.stringify(body), {
    status,
    statusText,
    headers: { "Content-Type": "application/json" },
  });
}

describe("apiErrorMessage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns string detail from JSON body", async () => {
    await expect(apiErrorMessage(jsonResponse({ detail: "Not allowed" }))).resolves.toBe(
      "Not allowed",
    );
  });

  it("stringifies non-string detail", async () => {
    await expect(apiErrorMessage(jsonResponse({ detail: { code: 1 } }))).resolves.toBe(
      '{"code":1}',
    );
  });

  it("returns raw body when not JSON with detail", async () => {
    await expect(apiErrorMessage(new Response("plain error", { status: 502 }))).resolves.toBe(
      "plain error",
    );
  });

  it("uses fallback when body empty", async () => {
    await expect(
      apiErrorMessage(new Response("", { status: 500, statusText: "Server Error" }), "Try again"),
    ).resolves.toBe("Try again");
  });
});
