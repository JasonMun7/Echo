"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { auth } from "@/lib/firebase";
import { useRouter } from "next/navigation";
import { IconDeviceDesktop, IconArrowLeft } from "@tabler/icons-react";
import Link from "next/link";

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
          <div className="mb-6 flex justify-center">
            <Image
              src="/echo_logo.png"
              alt="Echo"
              width={96}
              height={96}
              className="object-contain"
              style={{ aspectRatio: "1" }}
            />
          </div>
          <p className="text-sm text-red-500">{error}</p>
          <Link
            href="/signin?desktop=1"
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
            <Image
              src="/echo_logo.png"
              alt="Echo"
              width={96}
              height={96}
              className="object-contain"
              style={{ aspectRatio: "1" }}
            />
          </div>
          <p className="text-center text-sm text-[#150A35]/80">
            Preparing your session…
          </p>
        </div>
      </div>
    );
  }

  const desktopUrl = `echo-desktop://?token=${encodeURIComponent(token)}`;

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-[#F5F7FC] px-4">
      <div className="echo-card mx-auto w-full max-w-md p-6 shadow-sm md:p-8">
        <div className="mb-6 flex justify-center">
          <Image
            src="/echo_logo.png"
            alt="Echo"
            width={96}
            height={96}
            className="object-contain"
            style={{ aspectRatio: "1" }}
          />
        </div>
        <h2 className="text-center text-xl font-bold text-[#150A35]">
          You&apos;re signed in
        </h2>
        <p className="mt-2 text-center text-sm text-[#150A35]/80">
          Return to the Echo Desktop app to continue.
        </p>

        <a
          href={desktopUrl}
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
