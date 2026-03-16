import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electronAPI", {
  getSources: () => ipcRenderer.invoke("get-sources"),
  getPrimarySourceId: () =>
    ipcRenderer.invoke("get-primary-source-id") as Promise<string | null>,
  createRun: (args: { workflowId: string; token: string }) =>
    ipcRenderer.invoke("create-run", args),
  runWorkflowLocal: (args: {
    steps: Array<Record<string, unknown>>;
    sourceId: string;
    workflowType?: string;
    workflowId?: string;
    runId?: string;
    token?: string;
  }) => ipcRenderer.invoke("run-workflow-local", args),
  runGoalOnlyLocal: (args: {
    goal: string;
    sourceId: string;
    workflowType?: string;
    workflowId: string;
    runId: string;
    token: string;
  }) => ipcRenderer.invoke("run-goal-only-local", args),
  fetchWorkflow: (args: {
    workflowId: string;
    apiUrl?: string;
    token?: string;
  }) => ipcRenderer.invoke("fetch-workflow", args),
  authGetToken: () => ipcRenderer.invoke("auth-get-token") as Promise<string | null>,
  authStoreToken: (token: string) => ipcRenderer.invoke("auth-store-token", token),
  authClearToken: () => ipcRenderer.invoke("auth-clear-token"),
  authOpenSignin: () => ipcRenderer.invoke("auth-open-signin"),
  onAuthTokenReceived: (callback: () => void) => {
    ipcRenderer.on("auth-token-received", () => callback());
  },
  removeAuthTokenReceivedListener: () => {
    ipcRenderer.removeAllListeners("auth-token-received");
  },
  onRunFromUrl: (callback: (arg: { workflowId: string; runId: string }) => void) => {
    ipcRenderer.on("run-from-url", (_, arg) => callback(arg));
  },
  removeRunFromUrlListener: () => {
    ipcRenderer.removeAllListeners("run-from-url");
  },
  onOpenEchoPrism: (callback: () => void) => {
    ipcRenderer.on("open-echoprism", () => callback());
  },
  removeOpenEchoPrismListener: () => {
    ipcRenderer.removeAllListeners("open-echoprism");
  },
  onStartCapture: (callback: () => void) => {
    ipcRenderer.on("start-capture", () => callback());
  },
  removeStartCaptureListener: () => {
    ipcRenderer.removeAllListeners("start-capture");
  },
  onScreenPermissionRequired: (callback: () => void) => {
    ipcRenderer.on("screen-permission-required", () => callback());
  },
  checkScreenPermission: () => ipcRenderer.invoke("check-screen-permission") as Promise<boolean>,
  openSystemSettings: () => ipcRenderer.invoke("open-system-settings"),
  listWorkflows: (args: { token: string }) =>
    ipcRenderer.invoke("list-workflows", args) as Promise<
      | { workflows: Array<{ id: string; name?: string; status?: string; workflow_type?: string }> }
      | { error: string }
    >,
  openWebUI: (path?: string) => ipcRenderer.invoke("open-web-ui", path),

  desktopCollapse: () => ipcRenderer.invoke("desktop-collapse"),
  desktopExpand: () => ipcRenderer.invoke("desktop-expand"),
  onDesktopStateChanged: (callback: (arg: { collapsed: boolean }) => void) => {
    ipcRenderer.on("desktop-state-changed", (_, arg: { collapsed: boolean }) => callback(arg));
  },
  removeDesktopStateChangedListener: () => {
    ipcRenderer.removeAllListeners("desktop-state-changed");
  },
  quitApp: () => ipcRenderer.invoke("app-quit"),

  // Pause / resume run
  pauseRun: () => ipcRenderer.invoke("pause-run"),
  resumeRun: () => ipcRenderer.invoke("resume-run"),

  // Mode switching (Main Process as source of truth)
  enterRecordingMode: () => ipcRenderer.invoke("enter-recording-mode"),
  exitRecordingMode: () => ipcRenderer.invoke("exit-recording-mode"),
  enterRunMode: (ctx: { workflowId: string; runId: string; token: string; goalOnly?: boolean }) =>
    ipcRenderer.invoke("enter-run-mode", ctx),
  exitRunMode: () => ipcRenderer.invoke("exit-run-mode"),

  // HUD recording commands (forwarded to Main Window)
  recordingPause: () => ipcRenderer.invoke("recording-pause"),
  recordingStop: (duration?: number) => ipcRenderer.invoke("recording-stop", duration),
  recordingRedo: () => ipcRenderer.invoke("recording-redo"),
  recordingDiscard: () => ipcRenderer.invoke("recording-discard"),

  // HUD run commands
  cancelRun: () => ipcRenderer.invoke("cancel-run"),
  sendInterrupt: (text: string) => ipcRenderer.invoke("send-interrupt", text),
  sendCallUserFeedback: (text: string) => ipcRenderer.invoke("calluser-feedback", text),

  onRunAwaitingUser: (callback: (arg: { reason: string }) => void) => {
    ipcRenderer.on("run-awaiting-user", (_, arg: { reason: string }) => callback(arg));
  },
  removeRunAwaitingUserListener: () => {
    ipcRenderer.removeAllListeners("run-awaiting-user");
  },

  // Main window: receive recording commands from Main Process (forwarded from HUD)
  onRecordingCommand: (callback: (payload: { action: string }) => void) => {
    ipcRenderer.on("recording-command", (_, payload) => callback(payload));
  },
  removeRecordingCommandListener: () => {
    ipcRenderer.removeAllListeners("recording-command");
  },

  // Real-time run progress IPC
  onRunProgress: (callback: (entry: { thought: string; action: string; step: number }) => void) => {
    ipcRenderer.on("run-progress", (_, entry) => callback(entry));
  },
  removeRunProgressListener: () => ipcRenderer.removeAllListeners("run-progress"),

  // Voice interruption
  openVoiceInterruption: () => ipcRenderer.invoke("open-voice-interruption"),
  closeVoiceInterruption: () => ipcRenderer.invoke("close-voice-interruption"),
  resumeRunFromVoice: () => ipcRenderer.invoke("resume-run-from-voice"),
  onVoiceInterruptionContext: (callback: (ctx: {
    workflowId: string;
    runId: string;
    recentThoughts: Array<{ thought: string; action: string; step: number }>;
  }) => void) => {
    ipcRenderer.on("voice-interruption-context", (_, ctx) => callback(ctx));
  },
  removeVoiceInterruptionContextListener: () => {
    ipcRenderer.removeAllListeners("voice-interruption-context");
  },
  onRunPausedByVoice: (callback: () => void) => {
    ipcRenderer.on("run-paused-by-voice", () => callback());
  },
  removeRunPausedByVoiceListener: () => {
    ipcRenderer.removeAllListeners("run-paused-by-voice");
  },
  onRunResumedByVoice: (callback: () => void) => {
    ipcRenderer.on("run-resumed-by-voice", () => callback());
  },
  removeRunResumedByVoiceListener: () => {
    ipcRenderer.removeAllListeners("run-resumed-by-voice");
  },

  onUpdateAvailable: (callback: () => void) => {
    ipcRenderer.on("update-available", () => callback());
  },
  removeUpdateAvailableListener: () => {
    ipcRenderer.removeAllListeners("update-available");
  },
  onUpdateDownloaded: (callback: (arg: { version: string }) => void) => {
    ipcRenderer.on("update-downloaded", (_, arg: { version: string }) => callback(arg));
  },
  removeUpdateDownloadedListener: () => {
    ipcRenderer.removeAllListeners("update-downloaded");
  },
  quitAndInstall: () => ipcRenderer.invoke("quit-and-install"),
  checkForUpdates: () => ipcRenderer.invoke("check-for-updates"),
});
