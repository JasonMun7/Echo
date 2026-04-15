"use client";

import { EchoPrismLiveKitSession } from "@/components/echo-prism-livekit-session";

export default function ChatPage() {
  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden rounded-tl-2xl border border-border bg-card">
      <EchoPrismLiveKitSession className="min-h-0 flex-1" />
    </div>
  );
}
