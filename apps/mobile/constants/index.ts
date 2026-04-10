import Constants from "expo-constants";

const extra = Constants.expoConfig?.extra ?? {};

/**
 * In dev-client builds, Expo sets debuggerHost to the dev machine's IP
 * (e.g. "192.168.1.166:8082"). We extract just the hostname so physical
 * devices can reach the local backend/agent without hardcoded IPs.
 */
function getDevHost(): string | null {
  const debuggerHost = Constants.debuggerHost ?? Constants.expoGoConfig?.debuggerHost;
  if (!debuggerHost) return null;
  // debuggerHost is "ip:port" — strip the port
  return debuggerHost.split(":")[0];
}

function resolveUrl(configUrl: string, fallback: string): string {
  const url = configUrl || fallback;
  // If it's a localhost URL and we're on a physical device with a known dev host,
  // swap localhost for the dev machine's IP so the device can reach it.
  if (__DEV__ && url.includes("localhost")) {
    const devHost = getDevHost();
    if (devHost && devHost !== "localhost" && devHost !== "127.0.0.1") {
      return url.replace("localhost", devHost);
    }
  }
  return url;
}

/** Backend API URL — reads from Doppler via app.config.ts */
export const API_URL: string = resolveUrl(extra.apiUrl, "http://localhost:8000");

/** EchoPrism Agent URL — reads from Doppler via app.config.ts */
export const AGENT_URL: string = resolveUrl(extra.agentUrl, "http://localhost:8083");
