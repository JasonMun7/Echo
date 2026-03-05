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

  // Pause / resume run
  pauseRun: () => ipcRenderer.invoke("pause-run"),
  resumeRun: () => ipcRenderer.invoke("resume-run"),

  // Mode switching (Main Process as source of truth)
  enterRecordingMode: () => ipcRenderer.invoke("enter-recording-mode"),
  exitRecordingMode: () => ipcRenderer.invoke("exit-recording-mode"),
  enterRunMode: (ctx: { workflowId: string; runId: string; token: string }) =>
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

  // EchoPrismVoice IPC
  startVoiceChat: () => ipcRenderer.invoke("start-voice-chat"),
  stopVoiceChat: () => ipcRenderer.invoke("stop-voice-chat"),
  sendChatText: (text: string) => ipcRenderer.invoke("send-chat-text", text),
  onChatAudio: (cb: (chunk: ArrayBuffer) => void) => {
    ipcRenderer.on("chat-audio", (_, buf) => cb(buf));
  },
  onChatText: (cb: (msg: { role: string; text: string }) => void) => {
    ipcRenderer.on("chat-text", (_, msg) => cb(msg));
  },
  removeChatListeners: () => {
    ipcRenderer.removeAllListeners("chat-audio");
    ipcRenderer.removeAllListeners("chat-text");
  },
});
