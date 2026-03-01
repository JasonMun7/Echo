/**
 * EchoPrismVoice — Desktop Gemini Live API session.
 * Runs in Electron main process using @google/genai directly.
 * Emits "audio" and "text" events to renderer via IPC callback.
 */
import { GoogleGenAI } from "@google/genai";

const MODEL = "gemini-2.5-flash-preview-native-audio-dialog";

type EventCallback = (type: "audio" | "text", data: unknown) => void;

const SYSTEM_PROMPT = `You are EchoPrismVoice, an intelligent assistant for the Echo desktop workflow automation platform.
You can help users create workflows, run automations, manage integrations, and control the agent.
Be concise and helpful. When a user asks to run a workflow, confirm the name and tell them to click the Run button.
When they want to create a workflow, suggest they describe it or start a screen recording.`;

export class EchoPrismVoiceSession {
  private apiKey: string;
  private onEvent: EventCallback;
  private session: unknown = null;
  private running = false;

  constructor(token: string, onEvent: EventCallback) {
    // In desktop, we use the env var API key directly
    this.apiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || "";
    this.onEvent = onEvent;
  }

  async start(): Promise<void> {
    if (!this.apiKey) {
      this.onEvent("text", "GEMINI_API_KEY not set. Please configure it in your environment.");
      return;
    }

    const client = new GoogleGenAI({ apiKey: this.apiKey });
    this.running = true;

    const config = {
      responseModalities: ["AUDIO", "TEXT"],
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    };

    try {
      const session = await (client as unknown as { live: { connect: (model: string, config: unknown) => Promise<unknown> } })
        .live.connect(MODEL, config);
      this.session = session;

      this.onEvent("text", "EchoPrismVoice connected. How can I help you?");

      // Start listening for responses
      this.listenForResponses(session);
    } catch (e) {
      this.onEvent("text", `Connection failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  private async listenForResponses(session: unknown): Promise<void> {
    const liveSession = session as {
      receive: () => AsyncIterable<{
        serverContent?: { modelTurn?: { parts: Array<{ text?: string; inlineData?: { data: Buffer; mimeType: string } }> } };
        toolCall?: unknown;
      }>;
    };
    try {
      for await (const response of liveSession.receive()) {
        if (!this.running) break;
        if (response.serverContent?.modelTurn) {
          for (const part of response.serverContent.modelTurn.parts) {
            if (part.text) {
              this.onEvent("text", part.text);
            }
            if (part.inlineData?.data) {
              this.onEvent("audio", part.inlineData.data);
            }
          }
        }
      }
    } catch {
      // Session closed
    }
  }

  async sendText(text: string): Promise<void> {
    if (!this.session) return;
    const s = this.session as {
      sendClientContent: (content: { turns: { role: string; parts: Array<{ text: string }> }; turnComplete: boolean }) => Promise<void>;
    };
    await s.sendClientContent({
      turns: { role: "user", parts: [{ text }] },
      turnComplete: true,
    });
  }

  async sendAudio(pcmChunk: Buffer): Promise<void> {
    if (!this.session) return;
    const s = this.session as {
      sendRealtimeInput: (input: { audio: { data: Buffer; mimeType: string } }) => Promise<void>;
    };
    await s.sendRealtimeInput({
      audio: { data: pcmChunk, mimeType: "audio/pcm;rate=16000" },
    });
  }

  async stop(): Promise<void> {
    this.running = false;
    this.session = null;
  }
}
