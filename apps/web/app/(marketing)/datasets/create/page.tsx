"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import DatasetCreatorPage from "@/components/dataset-creator-page";
import { Container } from "@/components/marketing/container";
import { useAuthStore } from "@/stores";

export default function DatasetsCreatePage() {
  const user = useAuthStore((s) => s.user);
  const loading = useAuthStore((s) => s.loading);
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/signin");
    }
  }, [loading, user, router]);

  if (loading || !user) {
    return (
      <div className="flex min-h-[60vh] w-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#A577FF] border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="min-h-[80vh] pt-20 pb-12 md:pt-24 md:pb-16">
      <Container className="w-full">
        <DatasetCreatorPage />
      </Container>
    </div>
  );
}
