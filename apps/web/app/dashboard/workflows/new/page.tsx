"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { IconDeviceDesktop } from "@tabler/icons-react";

const CAPTURE_URL = "echo-desktop://capture";
const REDIRECT_DELAY_MS = 2000;

/**
 * Only redirect to get-started if the desktop app did not open (page stays visible).
 * If the user has the app, it steals focus and we skip the redirect.
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
        router.push("/get-started");
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
    <div className="flex flex-1 flex-col items-center justify-center gap-6 p-6 md:p-10">
      <div className="relative flex h-16 w-16 items-center justify-center">
        <div className="absolute inset-0 animate-spin rounded-full border-2 border-[#A577FF]/20 border-t-[#A577FF]" />
        <IconDeviceDesktop className="h-7 w-7 text-[#A577FF]" />
      </div>
      <div className="flex flex-col items-center gap-1.5 text-center">
        <p className="text-base font-semibold text-[#150A35]">
          Opening Echo Desktop…
        </p>
        <p className="text-sm text-[#150A35]/60">
          Echo Desktop will open so you can record a workflow.
        </p>
      </div>
      <p className="text-center text-xs text-[#150A35]/50">
        Don&apos;t have the app?{" "}
        <Link href="/get-started" className="text-[#A577FF] hover:underline">
          Download Echo Desktop
        </Link>
        {" · "}
        <Link href="/dashboard/workflows" className="text-[#A577FF] hover:underline">
          Back to workflows
        </Link>
      </p>
    </div>
  );
}
