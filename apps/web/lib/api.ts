import { auth } from "./firebase";
import { useAuthStore } from "@/stores";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

/** Echo Prism agent (chat `/ws/chat`, voice, synthesis). Not the same process as the main API (:8000). */
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

async function getToken(): Promise<string | null> {
  const token = await useAuthStore.getState().getIdToken();
  if (token) return token;
  return auth?.currentUser ? await auth.currentUser.getIdToken() : null;
}

export async function apiFetch(
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  const token = await getToken();
  const headers: HeadersInit = {
    ...options.headers,
  };
  if (token) {
    (headers as Record<string, string>)["Authorization"] = `Bearer ${token}`;
  }
  return fetch(`${API_URL}${path}`, { ...options, headers });
}

/** Fetch from agent service (chat, voice, synthesis). Uses Bearer auth. */
export async function agentFetch(
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  const token = await getToken();
  const headers: HeadersInit = { ...options.headers };
  if (token) {
    (headers as Record<string, string>)["Authorization"] = `Bearer ${token}`;
  }
  return fetch(`${AGENT_URL}${path}`, { ...options, headers });
}
