/**
 * Run control — pause/resume and cancel support for desktop workflow runs.
 * Used by remote-workflow-runner to wait when user pauses; cancel aborts the run.
 */
let paused = false;
let cancelRequested = false;
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

export function requestCancel(): void {
  cancelRequested = true;
  if (resolveResume) {
    resolveResume();
    resolveResume = null;
  }
}

export function isCancelRequested(): boolean {
  return cancelRequested;
}

export function clearCancel(): void {
  cancelRequested = false;
}

export function isPaused(): boolean {
  return paused;
}

/**
 * If the run is paused, waits until the user resumes or cancels. Call between steps.
 */
export function waitIfPaused(): Promise<void> {
  if (cancelRequested) return Promise.resolve();
  if (!paused) return Promise.resolve();
  return new Promise<void>((resolve) => {
    resolveResume = resolve;
  });
}
