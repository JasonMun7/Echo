/**
 * Voice backend client — connects to backend WebSocket for EchoPrismVoice.
 * Uses the same /ws/chat?mode=voice endpoint as the web app.
 * Supports tool calling (list_workflows, run_workflow, redirect_run, etc.).
 */
import WebSocket from "ws";

type EventCallback = (type: "audio" | "text", data: unknown) => void;

export interface VoiceBackendClientOptions {
  backendUrl: string;
  token: string;
  workflowId?: string;
  runId?: string;
}

export class VoiceBackendClient {
  private ws: WebSocket | null = null;
  private onEvent: EventCallback;
  private opts: VoiceBackendClientOptions;

  constructor(opts: VoiceBackendClientOptions, onEvent: EventCallback) {
    this.opts = opts;
    this.onEvent = onEvent;
  }

  async start(): Promise<void> {
    if (!this.opts.token) {
      this.onEvent("text", "Token required. Please sign in.");
      return;
    }

    const base = this.opts.backendUrl.replace(/^http/, "ws").replace(/\/$/, "");
    const params = new URLSearchParams({ token: this.opts.token, mode: "voice" });
    if (this.opts.workflowId) params.set("workflow_id", this.opts.workflowId);
    if (this.opts.runId) params.set("run_id", this.opts.runId);
    const url = `${base}/ws/chat?${params.toString()}`;

    return new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(url);
      this.ws = ws;

      ws.on("open", () => {
        this.onEvent("text", "EchoPrismVoice connected. How can I help you?");
        resolve();
      });

      ws.on("message", (data: Buffer | Buffer[] | string) => {
        if (Buffer.isBuffer(data)) {
          this.onEvent("audio", data);
          return;
        }
        if (Array.isArray(data)) {
          const buf = Buffer.concat(data as Buffer[]);
          this.onEvent("audio", buf);
          return;
        }
        try {
          const parsed = JSON.parse(data as string) as Record<string, unknown>;
          const t = parsed.type as string;
          if (t === "text" && typeof parsed.text === "string") {
            this.onEvent("text", parsed.text);
          } else if (t === "error" && typeof parsed.text === "string") {
            this.onEvent("text", `Error: ${parsed.text}`);
          }
          // transcript, tool_call, turn_complete — desktop chat panel doesn't need to display these
        } catch {
          // ignore non-JSON
        }
      });

      ws.on("error", (err) => {
        this.onEvent("text", `Connection error: ${err instanceof Error ? err.message : String(err)}`);
        reject(err);
      });

      ws.on("close", () => {
        this.ws = null;
      });
    });
  }

  sendText(text: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({ type: "text", text }));
  }

  sendAudio(pcmChunk: Buffer): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(pcmChunk);
  }

  stop(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}
