import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electronAPI", {
  getSources: () => ipcRenderer.invoke("get-sources"),
  getPrimarySourceId: () =>
    ipcRenderer.invoke("get-primary-source-id") as Promise<string | null>,
  runWorkflowLocal: (args: { steps: Array<Record<string, unknown>>; sourceId: string }) =>
    ipcRenderer.invoke("run-workflow-local", args),
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
