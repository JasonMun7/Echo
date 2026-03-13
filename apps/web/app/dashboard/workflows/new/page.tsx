"use client";

import { useEffect } from "react";
import Link from "next/link";
import { IconDeviceDesktop } from "@tabler/icons-react";

export default function NewWorkflowPage() {
  useEffect(() => {
    window.location.href = "echo-desktop://capture";
  }, []);

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 rounded-tl-2xl border border-[#A577FF]/20 border-l-0 bg-white p-6 md:p-10">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#A577FF]/10">
        <IconDeviceDesktop className="h-6 w-6 text-[#A577FF]" />
      </div>
      <p className="text-center text-sm text-[#150A35]/80">
        Opening Echo Desktop to create a workflow…
      </p>
      <p className="text-center text-xs text-[#150A35]/60">
        Don&apos;t have the app?{" "}
        <Link href="/dashboard/workflows" className="text-[#A577FF] hover:underline">
          Go back to workflows
        </Link>
      </p>
    </div>
  );
}
