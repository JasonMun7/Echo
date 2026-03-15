"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useRouter, useSearchParams } from "next/navigation";
import { IconDeviceDesktop, IconArrowLeft } from "@tabler/icons-react";
import Link from "next/link";

function DesktopSuccessContent() {
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const tokenSentRef = useRef(false);
  const redirectTimeoutRef = useRef<number | ReturnType<typeof setTimeout> | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackPort = searchParams.get("port");

  // Send token to desktop: localhost callback (works in dev when protocol is not handed off) + protocol link (production)
  useEffect(() => {
    if (!token || tokenSentRef.current) return;
    tokenSentRef.current = true;

    const encoded = encodeURIComponent(token);

    // Localhost callback so desktop receives token even when echo-desktop:// is not handled (e.g. Electron dev)
    if (callbackPort) {
      fetch(`http://127.0.0.1:${callbackPort}/?token=${encoded}`, {
        mode: "no-cors",
      }).catch(() => {});
    }

    // Protocol link for packaged app / when OS hands off
    const authUrl = `echo-desktop://?token=${encoded}`;
    const a = document.createElement("a");
    a.href = authUrl;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, [token, callbackPort]);

  // Wait for Firebase auth state before redirecting or getting token (avoids race where
  // currentUser is still null right after client-side redirect, or during account switch)
  useEffect(() => {
    if (!auth) {
      setTimeout(() => setError("Firebase is not configured."), 0);
      return;
    }
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (redirectTimeoutRef.current) {
        clearTimeout(redirectTimeoutRef.current);
        redirectTimeoutRef.current = null;
      }
      if (user) {
        user
          .getIdToken()
          .then((idToken) => setToken(idToken))
          .catch(() => setError("Failed to get token"));
        return;
      }
      // When user is null, wait briefly before redirecting so we don't redirect during
      // account switch (Firebase can emit null then the new user in quick succession)
      redirectTimeoutRef.current = window.setTimeout(() => {
        redirectTimeoutRef.current = null;
        const portQs = callbackPort ? `&port=${callbackPort}` : "";
        router.replace(`/signin?desktop=1${portQs}`);
      }, 1500);
    });
    return () => {
      unsubscribe();
      if (redirectTimeoutRef.current) {
        clearTimeout(redirectTimeoutRef.current);
        redirectTimeoutRef.current = null;
      }
    };
  }, [router, callbackPort]);

  if (error) {
    return (
      <div className="flex min-h-screen w-full items-center justify-center bg-[#F5F7FC] px-4">
        <div className="echo-card mx-auto w-full max-w-md p-6 shadow-sm">
          <div className="mb-6 flex justify-center">
            <div className="relative w-[120px] h-[120px]">
              <Image
                src="/echo_logo.png"
                alt="Echo"
                fill
                className="object-contain"
              />
            </div>
          </div>
          <p className="text-sm text-red-500">{error}</p>
          <Link
            href={`/signin?desktop=1${callbackPort ? `&port=${callbackPort}` : ""}`}
            className="echo-btn-cyan-lavender mt-4 flex h-10 w-full cursor-pointer items-center justify-center gap-2"
          >
            Try again
          </Link>
        </div>
      </div>
    );
  }

  if (!token) {
    return (
      <div className="flex min-h-screen w-full items-center justify-center bg-[#F5F7FC] px-4">
        <div className="echo-card mx-auto w-full max-w-md p-6 shadow-sm">
          <div className="mb-6 flex justify-center">
            <div className="relative w-[120px] h-[120px]">
              <Image
                src="/echo_logo.png"
                alt="Echo"
                fill
                className="object-contain"
              />
            </div>
          </div>
          <p className="text-center text-sm text-[#150A35]/80">
            Preparing your session…
          </p>
        </div>
      </div>
    );
  }

  // Open-only URL — no token; used purely to navigate back to the desktop app
  const openDesktopUrl = "echo-desktop://open";

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-[#F5F7FC] px-4">
      <div className="echo-card mx-auto w-full max-w-md p-6 shadow-sm md:p-8">
        <div className="mb-6 flex justify-center">
          <div className="relative w-[120px] h-[120px]">
            <Image
              src="/echo_logo.png"
              alt="Echo"
              fill
              className="object-contain"
            />
          </div>
        </div>
        <h2 className="text-center text-xl font-bold text-[#150A35]">
          You&apos;re signed in
        </h2>
        <p className="mt-2 text-center text-sm text-[#150A35]/80">
          Return to the Echo Desktop app to continue.
        </p>

        <a
          href={openDesktopUrl}
          className="echo-btn-cyan-lavender mt-6 flex h-10 w-full cursor-pointer items-center justify-center gap-2"
        >
          <IconDeviceDesktop className="size-5" />
          Go back to desktop app
        </a>

        <Link
          href="/dashboard"
          className="echo-btn-secondary mt-3 flex h-10 w-full cursor-pointer items-center justify-center gap-2"
        >
          <IconArrowLeft className="size-4" />
          Back to dashboard
        </Link>

        <p className="mt-6 text-center text-xs text-[#150A35]/60">
          You can safely close this tab or window now.
        </p>
      </div>
    </div>
  );
}

export default function DesktopSuccessPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen w-full items-center justify-center bg-[#F5F7FC] px-4">
          <div className="echo-card mx-auto w-full max-w-md p-6 shadow-sm">
            <div className="mb-6 flex justify-center">
              <div className="relative w-[120px] h-[120px]">
                <Image
                  src="/echo_logo.png"
                  alt="Echo"
                  fill
                  className="object-contain"
                />
              </div>
            </div>
            <p className="text-center text-sm text-[#150A35]/80">
              Preparing your session…
            </p>
          </div>
        </div>
      }
    >
      <DesktopSuccessContent />
    </Suspense>
  );
}
