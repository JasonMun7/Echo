import { auth } from "./firebase";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
/** Agent service URL for chat, voice, synthesis — falls back to API if not set */
export const AGENT_URL = process.env.NEXT_PUBLIC_ECHO_AGENT_URL || API_URL;

export async function apiFetch(
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  const token = auth?.currentUser ? await auth.currentUser.getIdToken() : null;
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
  const token = auth?.currentUser ? await auth.currentUser.getIdToken() : null;
  const headers: HeadersInit = { ...options.headers };
  if (token) {
    (headers as Record<string, string>)["Authorization"] = `Bearer ${token}`;
  }
  return fetch(`${AGENT_URL}${path}`, { ...options, headers });
}
