"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { IconDeviceDesktop } from "@tabler/icons-react";

const CAPTURE_URL = "echo-desktop://capture";
const REDIRECT_DELAY_MS = 2000;

/**
 * Try to open Echo Desktop capture. If the app does not open (page stays visible after delay),
 * redirect to /dashboard/workflows so users who have the app aren't sent to get-started.
 */
export default function NewWorkflowPage() {
  const router = useRouter();
  const redirectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    window.location.href = CAPTURE_URL;
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden" && redirectTimeoutRef.current) {
        clearTimeout(redirectTimeoutRef.current);
        redirectTimeoutRef.current = null;
        document.removeEventListener("visibilitychange", onVisibilityChange);
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    redirectTimeoutRef.current = setTimeout(() => {
      redirectTimeoutRef.current = null;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (document.visibilityState === "visible") {
        router.push("/dashboard/workflows");
      }
    }, REDIRECT_DELAY_MS);
    return () => {
      if (redirectTimeoutRef.current) {
        clearTimeout(redirectTimeoutRef.current);
        redirectTimeoutRef.current = null;
      }
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [router]);

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4  p-6 md:p-10">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#A577FF]/10">
        <IconDeviceDesktop className="h-6 w-6 text-[#A577FF]" />
      </div>
      <p className="text-center text-sm text-[#150A35]/80">
        Opening Echo Desktop to create a workflow…
      </p>
      <p className="text-center text-xs text-[#150A35]/60">
        Don&apos;t have the app?{" "}
        <Link href="/get-started" className="text-[#A577FF] hover:underline">
          Get started
        </Link>
        {" · "}
        <Link href="/dashboard/workflows" className="text-[#A577FF] hover:underline">
          Back to workflows
        </Link>
      </p>
    </div>
  );
}
