/**
 * Resolves the base URL for the Echo Prism **agent service** (Python app in repo `agent/`,
 * WebSocket `/api/agent/run`). The desktop app only runs this **client** code — inference lives on the server.
 *
 * - `VITE_API_URL` — REST API (runs, workflows, etc.). Default `http://localhost:8000`.
 * - `VITE_ECHO_AGENT_URL` — optional override when the agent is deployed on a different host than the API.
 *   If unset or empty, the client uses the same origin as `VITE_API_URL` (agent routes mounted on that server).
 */
export function getAgentServiceBaseUrl(): string {
  const api = (process.env.VITE_API_URL || "http://localhost:8000").replace(/\/$/, "");
  const override = process.env.VITE_ECHO_AGENT_URL?.trim();
  return (override && override.length > 0 ? override : api).replace(/\/$/, "");
}

/** REST API base (backend), same as used for create-run and Firestore-backed routes. */
export function getBackendApiBaseUrl(): string {
  return (process.env.VITE_API_URL || "http://localhost:8000").replace(/\/$/, "");
}
