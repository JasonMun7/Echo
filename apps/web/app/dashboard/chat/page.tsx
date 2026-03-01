"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { auth } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { MultiStepLoader } from "@/components/ui/multi-step-loader";
import {
  IconSend,
  IconSparkles,
  IconUser,
  IconMicrophone,
  IconPlayerStop,
  IconExternalLink,
  IconWaveSine,
  IconPlayerPlay,
} from "@tabler/icons-react";
import { cn } from "@/lib/utils";
import { EchoPrismVoiceModal } from "@/components/echoprisimvoice-modal";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const WS_URL = API_URL.replace(/^http/, "ws");

interface Message {
  id: string;
  role: "user" | "assistant";
  text: string;
  timestamp: Date;
  runLink?: { workflowId: string; runId: string; name: string };
}

const QUICK_CHIPS = [
  "List my workflows",
  "What can you do?",
  "Create a new workflow",
  "Show me my active runs",
];

const SYNTHESIS_STEPS = [
  { text: "Understanding your request" },
  { text: "Identifying workflow steps" },
  { text: "Generating step parameters" },
  { text: "Saving workflow" },
];

export default function ChatPage() {
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      text: "Hi! I'm EchoPrism. I can help you create workflows, run automations, and manage your Echo workspace. Try asking me to list your workflows or create a new one. For hands-free voice conversation, tap EchoPrismVoice.",
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState("");
  const [isConnected, setIsConnected] = useState(false);
  const [isSynthesizing, setIsSynthesizing] = useState(false);
  const [synthesizedWorkflow, setSynthesizedWorkflow] = useState<{ id: string; name: string } | null>(null);
  const [isDictating, setIsDictating] = useState(false);
  const [isVoiceModalOpen, setIsVoiceModalOpen] = useState(false);
  const [token, setToken] = useState<string | null>(null);

  // Text-mode WS (no audio)
  const wsRef = useRef<WebSocket | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const fetchToken = async () => {
      const user = auth?.currentUser;
      if (user) {
        const t = await user.getIdToken();
        setToken(t);
      }
    };
    fetchToken();
    const unsubscribe = auth?.onAuthStateChanged(async (u) => {
      if (u) {
        const t = await u.getIdToken();
        setToken(t);
      } else {
        router.replace("/signin");
      }
    });
    return () => unsubscribe?.();
  }, [router]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const addAssistantMessage = useCallback((text: string, runLink?: Message["runLink"]) => {
    setMessages((prev) => [
      ...prev,
      {
        id: Date.now().toString(),
        role: "assistant" as const,
        text,
        timestamp: new Date(),
        runLink,
      },
    ]);
  }, []);

  const startScreenRecording = useCallback(
    async (t: string) => {
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
        const recorder = new MediaRecorder(stream, { mimeType: "video/webm" });
        const chunks: Blob[] = [];
        recorder.ondataavailable = (e) => chunks.push(e.data);
        recorder.onstop = async () => {
          stream.getTracks().forEach((tr) => tr.stop());
          const blob = new Blob(chunks, { type: "video/webm" });
          const formData = new FormData();
          formData.append("file", blob, "recording.webm");
          formData.append("workflow_name", "Screen-Recorded Workflow");
          const resp = await fetch(`${API_URL}/api/synthesize`, {
            method: "POST",
            headers: { Authorization: `Bearer ${t}` },
            body: formData,
          });
          if (resp.ok) {
            const data = (await resp.json()) as { workflow_id: string; workflow_name?: string };
            addAssistantMessage("Screen recording processed! Your workflow has been created.", {
              workflowId: data.workflow_id,
              runId: "",
              name: data.workflow_name || "New Workflow",
            });
          }
          setIsSynthesizing(false);
        };
        setIsSynthesizing(true);
        addAssistantMessage("Recording started. When you stop sharing, I'll synthesize the workflow.");
        recorder.start();
        setTimeout(() => {
          if (recorder.state === "recording") recorder.stop();
        }, 5 * 60 * 1000);
      } catch {
        addAssistantMessage("Screen recording was cancelled.");
      }
    },
    [addAssistantMessage],
  );

  const connectWebSocket = useCallback(
    (t: string) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) return;
      // mode=text → TEXT modality, no audio blobs
      const ws = new WebSocket(`${WS_URL}/ws/chat?token=${encodeURIComponent(t)}&mode=text`);
      wsRef.current = ws;

      ws.onopen = () => setIsConnected(true);
      ws.onclose = () => {
        setIsConnected(false);
        setTimeout(() => connectWebSocket(t), 2000);
      };
      ws.onerror = () => setIsConnected(false);

      ws.onmessage = (event) => {
        // Text-mode never sends audio blobs
        if (event.data instanceof Blob) return;
        try {
          const data = JSON.parse(event.data as string) as Record<string, unknown>;
          if (data.type === "text" && data.text) {
            addAssistantMessage(data.text as string, data.runLink as Message["runLink"]);
          } else if (data.type === "tool_call" && data.name === "synthesize_from_description") {
            setIsSynthesizing(true);
            setSynthesizedWorkflow(null);
          } else if (data.type === "synthesis_complete") {
            setIsSynthesizing(false);
            setSynthesizedWorkflow({
              id: data.workflow_id as string,
              name: (data.workflow_name as string) || "New Workflow",
            });
          } else if (data.type === "turn_complete") {
            // nothing to reset for text mode
          } else if (data.type === "control" && data.action === "start_screen_recording") {
            startScreenRecording(t);
          } else if (data.type === "error") {
            addAssistantMessage(`Error: ${data.text as string}`);
          }
        } catch {
          // ignore non-JSON
        }
      };
    },
    [addAssistantMessage, startScreenRecording],
  );

  useEffect(() => {
    if (token) connectWebSocket(token);
    return () => {
      wsRef.current?.close();
    };
  }, [token, connectWebSocket]);

  function addUserMessage(text: string) {
    setMessages((prev) => [
      ...prev,
      { id: Date.now().toString(), role: "user", text, timestamp: new Date() },
    ]);
  }

  function sendTextMessage(text: string) {
    if (!text.trim() || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    addUserMessage(text);
    wsRef.current.send(JSON.stringify({ type: "text", text }));
    setInput("");
    // Clear previous synthesized workflow CTA when user sends a new message
    setSynthesizedWorkflow(null);
  }

  function toggleDictation() {
    const SpeechRecognitionAPI =
      typeof window !== "undefined" &&
      (window.SpeechRecognition ||
        (
          window as unknown as { webkitSpeechRecognition: typeof SpeechRecognition }
        ).webkitSpeechRecognition);

    if (!SpeechRecognitionAPI) return;

    if (isDictating) {
      recognitionRef.current?.stop();
      setIsDictating(false);
      return;
    }

    const recognition = new SpeechRecognitionAPI();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let transcript = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      setInput(transcript);
    };

    recognition.onend = () => setIsDictating(false);
    recognition.onerror = () => setIsDictating(false);

    recognitionRef.current = recognition;
    recognition.start();
    setIsDictating(true);
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendTextMessage(input);
    }
  };

  return (
    <>
      {/* Synthesis fullscreen loader */}
      <MultiStepLoader
        loadingStates={SYNTHESIS_STEPS}
        loading={isSynthesizing}
        duration={1800}
        loop={false}
      />

      <div className="flex h-full flex-col bg-white rounded-tl-2xl border border-[#A577FF]/20">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#A577FF]/20 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-linear-to-br from-[#A577FF] to-[#7C3AED]">
              <IconSparkles className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-[#1A1A2E]">EchoPrism</h1>
              <p className="text-xs text-gray-400">
                {isConnected ? (
                  <span className="flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    Connected
                  </span>
                ) : (
                  <span className="text-gray-400">Connecting...</span>
                )}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsVoiceModalOpen(true)}
              className="flex items-center gap-1.5 border-[#A577FF]/40 text-[#A577FF] bg-[#A577FF]/10 hover:bg-[#A577FF]/20 text-xs"
            >
              <IconWaveSine className="h-3.5 w-3.5" />
              EchoPrismVoice
            </Button>
            <Badge
              variant="outline"
              className="border-[#A577FF]/40 text-[#A577FF] bg-[#A577FF]/10 text-xs"
            >
              Gemini Live API
            </Badge>
          </div>
        </div>

        {/* Messages */}
        <ScrollArea className="flex-1 px-6 py-4">
          <div className="flex flex-col gap-4">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={cn(
                  "flex gap-3 max-w-[80%]",
                  msg.role === "user" ? "ml-auto flex-row-reverse" : "mr-auto",
                )}
              >
                <div
                  className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                    msg.role === "user"
                      ? "bg-[#A577FF] text-white"
                      : "bg-linear-to-br from-[#A577FF] to-[#7C3AED] text-white",
                  )}
                >
                  {msg.role === "user" ? (
                    <IconUser className="h-4 w-4" />
                  ) : (
                    <IconSparkles className="h-4 w-4" />
                  )}
                </div>
                <div className="flex flex-col gap-1">
                  <div
                    className={cn(
                      "rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
                      msg.role === "user"
                        ? "bg-[#A577FF] text-white rounded-tr-sm"
                        : "bg-[#F5F3FF] text-[#1A1A2E] border border-[#A577FF]/20 rounded-tl-sm",
                    )}
                  >
                    {msg.text}
                  </div>
                  {msg.runLink && msg.runLink.runId && (
                    <a
                      href={`/dashboard/workflows/${msg.runLink.workflowId}/runs/${msg.runLink.runId}`}
                      className="flex items-center gap-1 text-xs text-[#A577FF] hover:underline"
                    >
                      <IconExternalLink className="h-3 w-3" />
                      Track run: {msg.runLink.name}
                    </a>
                  )}
                  <span className="text-[10px] text-gray-400">
                    {msg.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>

        {/* Synthesized workflow CTA — shown after synthesis completes */}
        {synthesizedWorkflow && !isSynthesizing && (
          <div className="border-t border-[#A577FF]/20 px-6 py-3 flex items-center justify-between gap-4">
            <p className="text-sm text-gray-600">
              Workflow ready:{" "}
              <span className="font-medium text-[#1A1A2E]">{synthesizedWorkflow.name}</span>
            </p>
            <a
              href={`/dashboard/workflows/${synthesizedWorkflow.id}`}
              className="flex shrink-0 items-center gap-1.5 rounded-full bg-[#A577FF] px-4 py-1.5 text-xs font-medium text-white hover:opacity-90 transition-opacity"
            >
              <IconPlayerPlay className="h-3.5 w-3.5" />
              Run it
            </a>
          </div>
        )}

        {/* Quick chips */}
        <div className="flex gap-2 overflow-x-auto px-6 pb-2 scrollbar-hide">
          {QUICK_CHIPS.map((chip) => (
            <button
              key={chip}
              onClick={() => sendTextMessage(chip)}
              className="shrink-0 rounded-full border border-[#A577FF]/30 bg-[#F5F3FF] px-3 py-1 text-xs text-[#A577FF] hover:bg-[#A577FF]/10 transition-colors"
            >
              {chip}
            </button>
          ))}
        </div>

        {/* Input area */}
        <div className="flex items-center gap-3 border-t border-[#A577FF]/20 px-6 py-4">
          {/* Dictation mic — fills input box only, no live audio streaming */}
          <button
            onClick={toggleDictation}
            className={cn(
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-all",
              isDictating
                ? "bg-red-500 text-white animate-pulse ring-2 ring-red-400/50"
                : "bg-[#A577FF]/10 text-[#A577FF] hover:bg-[#A577FF]/20",
            )}
            title={isDictating ? "Stop dictation" : "Dictate message"}
          >
            {isDictating ? <IconPlayerStop className="h-4 w-4" /> : <IconMicrophone className="h-4 w-4" />}
          </button>

          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isDictating ? "Listening..." : "Message EchoPrism..."}
            className="flex-1 border-[#A577FF]/30 bg-[#F5F3FF] placeholder:text-gray-400 focus-visible:ring-[#A577FF]/50"
            disabled={!isConnected}
          />

          <Button
            onClick={() => sendTextMessage(input)}
            disabled={!input.trim() || !isConnected}
            className="h-10 w-10 shrink-0 rounded-full bg-linear-to-r from-[#A577FF] to-[#7C3AED] p-0 text-white hover:opacity-90"
          >
            <IconSend className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* EchoPrismVoice fullscreen modal — owns its own WebSocket (mode=voice) */}
      <EchoPrismVoiceModal
        isOpen={isVoiceModalOpen}
        onClose={() => setIsVoiceModalOpen(false)}
        token={token}
      />
    </>
  );
}
