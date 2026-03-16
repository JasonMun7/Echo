/** Electron preload API exposed to the renderer process */
declare global {
  interface Window {
    electronAPI?: {
      getSources: () => Promise<
        { id: string; name: string; thumbnail: string }[]
      >;
      getPrimarySourceId: () => Promise<string | null>;
      createRun: (args: {
        workflowId: string;
        token: string;
      }) => Promise<{ runId: string; workflowId: string } | { error: string }>;
      runWorkflowLocal: (args: {
        steps: Array<Record<string, unknown>>;
        sourceId: string;
        workflowType?: string;
        workflowId?: string;
        runId?: string;
        token?: string;
      }) => Promise<{ success: boolean; error?: string; progress?: string[] }>;
      runGoalOnlyLocal: (args: {
        goal: string;
        sourceId: string;
        workflowType?: string;
        workflowId: string;
        runId: string;
        token: string;
      }) => Promise<{ success: boolean; error?: string; progress?: string[] }>;
      fetchWorkflow: (args: { workflowId: string; token?: string }) => Promise<
        | {
            workflow: Record<string, unknown>;
            steps: Array<Record<string, unknown>>;
          }
        | { error: string }
      >;
      authGetToken: () => Promise<string | null>;
      authClearToken: () => Promise<void>;
      authOpenSignin: () => Promise<void>;
      onAuthTokenReceived: (callback: () => void) => void;
      removeAuthTokenReceivedListener: () => void;
      onScreenPermissionRequired: (callback: () => void) => void;
      checkScreenPermission: () => Promise<boolean>;
      openSystemSettings: () => Promise<void>;
      listWorkflows: (args: { token: string }) => Promise<
        | {
            workflows: Array<{
              id: string;
              name?: string;
              status?: string;
              workflow_type?: string;
            }>;
          }
        | { error: string }
      >;
      openWebUI: (path?: string) => Promise<void>;
      pauseRun: () => Promise<{ ok: boolean }>;
      resumeRun: () => Promise<{ ok: boolean }>;
      cancelRun: () => Promise<void>;
      sendInterrupt: (text: string) => Promise<void>;
      onRunProgress: (
        cb: (entry: { thought: string; action: string; step: number }) => void,
      ) => void;
      removeRunProgressListener: () => void;
      onRunFromUrl: (
        cb: (arg: { workflowId: string; runId: string }) => void,
      ) => void;
      removeRunFromUrlListener: () => void;
      onOpenEchoPrism: (callback: () => void) => void;
      removeOpenEchoPrismListener: () => void;
      onStartCapture: (callback: () => void) => void;
      removeStartCaptureListener: () => void;
      enterRecordingMode: () => Promise<{ ok: boolean }>;
      exitRecordingMode: () => Promise<{ ok: boolean }>;
      enterRunMode: (ctx: {
        workflowId: string;
        runId: string;
        token: string;
        goalOnly?: boolean;
      }) => Promise<{ ok: boolean }>;
      exitRunMode: () => Promise<{ ok: boolean }>;
      onRecordingCommand: (cb: (payload: { action: string }) => void) => void;
      removeRecordingCommandListener: () => void;
      recordingPause: () => Promise<void>;
      recordingStop: (duration?: number) => Promise<void>;
      recordingRedo: () => Promise<void>;
      recordingDiscard: () => Promise<void>;
      sendCallUserFeedback: (text: string) => Promise<{ ok: boolean }>;
      onRunAwaitingUser: (cb: (arg: { reason: string }) => void) => void;
      removeRunAwaitingUserListener: () => void;
      desktopCollapse: () => Promise<void>;
      desktopExpand: () => Promise<void>;
      onDesktopStateChanged: (
        callback: (arg: { collapsed: boolean }) => void,
      ) => void;
      removeDesktopStateChangedListener: () => void;
      quitApp: () => Promise<void>;
      onUpdateAvailable: (callback: () => void) => void;
      removeUpdateAvailableListener: () => void;
      onUpdateDownloaded: (callback: (arg: { version: string }) => void) => void;
      removeUpdateDownloadedListener: () => void;
      quitAndInstall: () => Promise<void>;
      checkForUpdates: () => Promise<unknown>;
    };
  }
}

export {};
