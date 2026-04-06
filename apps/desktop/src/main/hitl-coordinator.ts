/**
 * Human-in-the-loop coordination for remote runs (main process).
 * Bridges the workflow runner wait state with renderer actions and LangGraph resume values.
 */

/** Minimal fields needed to reopen the Auth0 / vault URL (see openAuth0ConnectForIntegration). */
export type IntegrationAuthPending = {
  backendUrl?: string;
  token?: string;
  integration: string;
  auth0Linked: boolean;
};

let pendingIntegrationAuth: IntegrationAuthPending | null = null;

export function setPendingIntegrationAuth(ctx: IntegrationAuthPending): void {
  pendingIntegrationAuth = ctx;
}

let resumeResolve: ((v: unknown) => void) | null = null;
let resumeReject: ((e: Error) => void) | null = null;

export function clearPendingIntegrationAuth(): void {
  pendingIntegrationAuth = null;
}

export function getPendingIntegrationAuth(): IntegrationAuthPending | null {
  return pendingIntegrationAuth;
}

/** Resolves with the value passed to ``notifyUserHitlResume`` (e.g. approval), or rejects on cancel. */
export function waitForUserHitlResume(): Promise<unknown> {
  return new Promise((resolve, reject) => {
    resumeResolve = (v: unknown) => {
      resumeResolve = null;
      resumeReject = null;
      resolve(v);
    };
    resumeReject = reject;
  });
}

export function notifyUserHitlResume(value: unknown): void {
  resumeResolve?.(value);
}

/** Call on cancel-run so Promise.race in the runner can exit before abortActiveRun. */
export function clearUserHitlWait(): void {
  resumeReject?.(new Error("Run cancelled"));
  resumeResolve = null;
  resumeReject = null;
}

/**
 * Drop the pending ``waitForUserHitlResume`` handlers without resolving (e.g. after
 * ``Promise.race`` when the poll branch wins). Prevents a late HUD click from resolving a stale wait.
 */
export function abandonHitlResume(): void {
  resumeResolve = null;
  resumeReject = null;
}
