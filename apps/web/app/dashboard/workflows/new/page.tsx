"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { IconDeviceDesktop } from "@tabler/icons-react";

const CAPTURE_URL = "echo-desktop://capture";
const REDIRECT_DELAY_MS = 2000;

export default function NewWorkflowPage() {
  const router = useRouter();

  useEffect(() => {
    window.location.href = CAPTURE_URL;
    const t = setTimeout(() => {
      router.push("/get-started");
    }, REDIRECT_DELAY_MS);
    return () => clearTimeout(t);
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
