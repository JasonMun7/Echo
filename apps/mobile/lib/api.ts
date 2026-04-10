import { auth } from "./firebase";
import { useAuthStore } from "@/stores/auth-store";
import { API_URL, AGENT_URL } from "@/constants";

async function getToken(): Promise<string | null> {
  const token = await useAuthStore.getState().getIdToken();
  if (token) return token;
  return auth?.currentUser ? await auth.currentUser.getIdToken() : null;
}

export async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const token = await getToken();
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  return fetch(`${API_URL}${path}`, { ...options, headers });
}

export async function agentFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const token = await getToken();
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  return fetch(`${AGENT_URL}${path}`, { ...options, headers });
}

export { API_URL, AGENT_URL };
