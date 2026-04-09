import { auth } from "./firebase";
import { useAuthStore } from "@/stores";

/** Main Echo backend (FastAPI :8000 in dev). */
export const MAIN_API_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const API_URL = MAIN_API_URL;

/**
 * Resolves the base URL for the Echo Prism agent service.
 *
 * If `NEXT_PUBLIC_ECHO_AGENT_URL` is set (trimmed non-empty) returns that value; in development, logs a warning if it points to `:8000` or `:8081`.
 * If not set, returns `http://127.0.0.1:8083` in development, otherwise returns `API_URL`.
 *
 * @returns The agent base URL as a string
 */
function resolveAgentUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_ECHO_AGENT_URL?.trim();
  if (explicit) {
    if (
      process.env.NODE_ENV === "development" &&
      /:(8000|8081)\b/.test(explicit)
    ) {
      console.warn(
        "[Echo] NEXT_PUBLIC_ECHO_AGENT_URL is %s — chat/voice WebSockets use the Echo Prism agent. Run `pnpm dev:agent` (default :8083) and set this to http://127.0.0.1:8083 or remove it for the dev default.",
        explicit,
      );
    }
    return explicit;
  }
  // `next dev`: WebSocket chat must hit the agent service (`pnpm dev:agent`, default :8083), not the backend.
  if (process.env.NODE_ENV === "development") {
    return "http://127.0.0.1:8083";
  }
  return API_URL;
}

/** Agent service URL for chat, voice, synthesis */
export const AGENT_URL = resolveAgentUrl();

/**
 * Waits for Firebase authentication state to be restored from persistence when supported.
 *
 * If the imported `auth` exposes an `authStateReady()` method, this function awaits it; otherwise it returns immediately.
 */
async function ensureAuthReady(): Promise<void> {
  const a = auth as { authStateReady?: () => Promise<void> } | null;
  if (a && typeof a.authStateReady === "function") {
    await a.authStateReady();
  }
}

/**
 * Retrieves an ID token for the current user, preferring Firebase's `currentUser` and falling back to the stored auth state.
 *
 * @param forceRefresh - If `true`, forces a refresh of the ID token instead of using a cached token.
 * @returns The user's ID token string, or `null` if no token is available.
 *
 * If obtaining a token from Firebase's `currentUser` fails or is unavailable, the function returns the token from the auth store.
 */
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

/**
 * Attach a Bearer Authorization header to a headers object when a token is provided.
 *
 * @param token - The Bearer token to set; if `null`, no Authorization header is added.
 * @param headers - The initial headers (will be shallow-copied and returned).
 * @returns The headers object containing `Authorization: Bearer <token>` when `token` is non-null, otherwise a shallow copy of `headers`.
 */
function withBearer(
  token: string | null,
  headers: HeadersInit
): HeadersInit {
  const h = { ...headers } as Record<string, string>;
  if (token) {
    h.Authorization = `Bearer ${token}`;
  }
  return h;
}

/**
 * Perform an HTTP request against the application's main API, attaching an auth Bearer token when available.
 *
 * Attempts the request to `${API_URL}${path}` with the provided `options` and includes `Authorization: Bearer <token>` if a token is present. If the initial response is `401` and a signed-in Firebase user exists, the function forces an ID token refresh and retries the request once with the refreshed token.
 *
 * @param path - The request path appended to the API base URL (`API_URL`), e.g. `"/v1/items"`.
 * @param options - Fetch options passed through to `fetch` (headers will be augmented with the Bearer token).
 * @returns The final `Response` object from `fetch` (initial response or retry).
 */
export async function apiFetch(
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  const token = await getToken();
  const headers = withBearer(token, options.headers ?? {});
  const url = `${API_URL}${path}`;
  let resp = await fetch(url, { ...options, headers });

  // One retry with a forced ID token refresh (expired tokens, tab idle).
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

/**
 * Send an HTTP request to the Echo Prism agent service and return the response.
 *
 * Augments the provided request with a `Authorization: Bearer <token>` header when a token is available.
 * If the initial response is `401` and a signed-in user exists, retries the request once after refreshing the token.
 *
 * @param path - Agent-relative request path (appended to the configured agent base URL)
 * @param options - Fetch options to use for the request; `headers` may be a HeadersInit value and will be merged with the bearer header
 * @returns The final Response from the agent, either the initial response or a single retry after token refresh
 */
export async function agentFetch(
  path: string,
  options: RequestInit = {}
): Promise<Response> {
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
