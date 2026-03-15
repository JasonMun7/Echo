"use client";

import { useEffect } from "react";

/** Sets echo-visited-download so navbar can show Sign in after visit (optional flow). */
export function DownloadPageClient({
  children,
}: {
  children: React.ReactNode;
}) {
  useEffect(() => {
    try {
      localStorage.setItem("echo-visited-download", "1");
    } catch {
      // ignore
    }
  }, []);
  return <>{children}</>;
}
