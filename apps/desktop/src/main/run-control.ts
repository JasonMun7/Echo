/**
 * Run control — pause/resume support for desktop workflow runs.
 * Used by echo-prism-agent to wait when user pauses; main process IPC sets state.
 */
let paused = false;
let resolveResume: (() => void) | null = null;

export function requestPause(): void {
  paused = true;
}

export function requestResume(): void {
  paused = false;
  if (resolveResume) {
    resolveResume();
    resolveResume = null;
  }
}

export function isPaused(): boolean {
  return paused;
}

/**
 * If the run is paused, waits until the user resumes. Call between steps.
 */
export function waitIfPaused(): Promise<void> {
  if (!paused) return Promise.resolve();
  return new Promise<void>((resolve) => {
    resolveResume = resolve;
  });
}
