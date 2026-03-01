"use client";

import { useEffect, useState } from "react";
import { auth } from "@/lib/firebase";
import { useRouter } from "next/navigation";
import { IconDeviceDesktop } from "@tabler/icons-react";

export default function DesktopSuccessPage() {
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    if (!auth) {
      setTimeout(() => setError("Firebase is not configured."), 0);
      return;
    }
    const user = auth.currentUser;
    if (!user) {
      router.replace("/signin?desktop=1");
      return;
    }
    user
      .getIdToken()
      .then((idToken) => setToken(idToken))
      .catch(() => setError("Failed to get token"));
  }, [router]);

  if (error) {
    return (
      <div className="flex min-h-screen w-full items-center justify-center bg-[#F5F7FC] px-4">
        <div className="echo-card mx-auto w-full max-w-md p-6 shadow-sm">
          <p className="text-sm text-red-500">{error}</p>
          <a
            href="/signin?desktop=1"
            className="echo-btn-primary mt-4 block w-full text-center"
          >
            Try again
          </a>
        </div>
      </div>
    );
  }

  if (!token) {
    return (
      <div className="flex min-h-screen w-full items-center justify-center bg-[#F5F7FC] px-4">
        <div className="echo-card mx-auto w-full max-w-md p-6 shadow-sm">
          <p className="text-sm text-[#150A35]/80">Preparing your session…</p>
        </div>
      </div>
    );
  }

  const desktopUrl = `echo-desktop://auth?token=${encodeURIComponent(token)}`;

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-[#F5F7FC] px-4">
      <div className="echo-card mx-auto w-full max-w-md p-6 shadow-sm md:p-8">
        <div className="mb-6 flex justify-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#A577FF]/20">
            <IconDeviceDesktop className="h-6 w-6 text-[#A577FF]" />
          </div>
        </div>
        <h2 className="text-xl font-bold text-[#150A35]">You&apos;re signed in</h2>
        <p className="mt-2 max-w-sm text-sm text-[#150A35]/80">
          Return to the Echo Desktop app to continue.
        </p>
        <a
          href={desktopUrl}
          className="echo-btn-primary mt-8 flex h-10 w-full items-center justify-center gap-2"
        >
          <IconDeviceDesktop className="h-5 w-5" />
          Go back to desktop app
        </a>
        <p className="mt-4 text-center text-xs text-[#150A35]/60">
          If the app doesn&apos;t open, copy this link and paste it in your
          browser:{" "}
          <span className="break-all font-mono text-[#A577FF]">{desktopUrl}</span>
        </p>
      </div>
    </div>
  );
}
