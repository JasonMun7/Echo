"use client";

import DatasetCreatorPage from "@/components/dataset-creator-page";
import { Container } from "@/components/marketing/container";

export default function DatasetsCreatePage() {
  return (
    <div className="min-h-[80vh] pt-20 pb-12 md:pt-24 md:pb-16">
      <Container className="w-full">
        <DatasetCreatorPage />
      </Container>
    </div>
  );
}
