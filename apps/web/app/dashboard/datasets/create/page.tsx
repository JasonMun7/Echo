"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function DashboardDatasetsCreatePage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/datasets/create");
  }, [router]);
  return null;
}
