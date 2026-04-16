import { auth } from "./firebase";
import { useAuthStore } from "@/stores";

/** Main Echo backend (FastAPI :8000 in dev). */
export const MAIN_API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const API_URL = MAIN_API_URL;

/** Echo Prism agent (LiveKit voice/chat, synthesis, `/api/agent/*`). Not the same process as the main API (:8000). */
function resolveAgentUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_ECHO_AGENT_URL?.trim();
  if (explicit) {
    if (process.env.NODE_ENV === "development" && /:(8000|8081)\b/.test(explicit)) {
      console.warn(
        "[Echo] NEXT_PUBLIC_ECHO_AGENT_URL is %s — EchoPrism (LiveKit + synthesis) uses the agent service. Run `pnpm dev:agent` (default :8083) and set this to http://127.0.0.1:8083 or remove it for the dev default.",
        explicit,
      );
    }
    return explicit;
  }
  // `next dev`: EchoPrism must hit the agent service (`pnpm dev:agent`, default :8083), not the backend.
  if (process.env.NODE_ENV === "development") {
    return "http://127.0.0.1:8083";
  }
  return API_URL;
}

/** Agent service URL for chat, voice, synthesis */
export const AGENT_URL = resolveAgentUrl();

/** Wait until Firebase has finished restoring session from persistence (avoids empty token on first paint). */
async function ensureAuthReady(): Promise<void> {
  const a = auth as { authStateReady?: () => Promise<void> } | null;
  if (a && typeof a.authStateReady === "function") {
    await a.authStateReady();
  }
}

/** Prefer Firebase `currentUser` so requests work even if Zustand has not synced yet after `onAuthStateChanged`. */
async function getToken(forceRefresh = false): Promise<string | null> {
  await ensureAuthReady();
  try {
    const u = auth && "currentUser" in auth ? auth.currentUser : null;
    if (u) {
      return await u.getIdToken(forceRefresh);
    }
  } catch {
    /* fall through */
  }
  return useAuthStore.getState().getIdToken();
}

function withBearer(token: string | null, headers: HeadersInit | undefined): Headers {
  const h = new Headers(headers ?? undefined);
  if (token && !h.has("Authorization")) {
    h.set("Authorization", `Bearer ${token}`);
  }
  return h;
}

export type ApiFetchOptions = RequestInit & {
  /** Force Firebase ID token refresh before the request (e.g. after OAuth redirect). */
  forceIdTokenRefresh?: boolean;
};

export async function apiFetch(path: string, options: ApiFetchOptions = {}): Promise<Response> {
  const { forceIdTokenRefresh, ...fetchOpts } = options;
  const token = await getToken(Boolean(forceIdTokenRefresh));
  const headers = withBearer(token, fetchOpts.headers ?? {});
  const url = `${API_URL}${path}`;
  let resp = await fetch(url, { ...fetchOpts, headers });

  // One retry with a forced ID token refresh (expired tokens, tab idle).
  if (resp.status === 401 && auth && "currentUser" in auth && auth.currentUser) {
    const fresh = await getToken(true);
    if (fresh) {
      resp = await fetch(url, {
        ...fetchOpts,
        headers: withBearer(fresh, fetchOpts.headers ?? {}),
      });
    }
  }

  return resp;
}

/**
 * Parse FastAPI-style error bodies (`{"detail": "..."}` or validation errors) for user-facing toasts.
 */
export async function apiErrorMessage(resp: Response, fallback?: string): Promise<string> {
  const raw = await resp.text();
  try {
    const j = JSON.parse(raw) as { detail?: unknown };
    if (j.detail != null) {
      if (typeof j.detail === "string") return j.detail;
      return JSON.stringify(j.detail);
    }
  } catch {
    /* not JSON */
  }
  if (raw.trim()) return raw.trim();
  return fallback ?? resp.statusText ?? `HTTP ${resp.status}`;
}

/** Fetch from agent service (chat, voice, synthesis). Uses Bearer auth. */
export async function agentFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const token = await getToken();
  const headers = withBearer(token, options.headers ?? {});
  const url = `${AGENT_URL}${path}`;
  let resp = await fetch(url, { ...options, headers });
  if (resp.status === 401 && auth && "currentUser" in auth && auth.currentUser) {
    const fresh = await getToken(true);
    if (fresh) {
      resp = await fetch(url, {
        ...options,
        headers: withBearer(fresh, options.headers ?? {}),
      });
    }
  }
  return resp;
}
