import Link from "next/link";
import { IconArrowLeft } from "@tabler/icons-react";
import { Container } from "@/components/marketing/container";
import { Logo } from "@/components/marketing/logo";
import { getSEOTags } from "@/lib/seo";
import { GetStartedStickySection } from "./get-started-sticky-section";

export const metadata = getSEOTags({
  title: "Get Started | Echo",
  description: "Download Echo Desktop, install, and sign in to start building AI-driven workflows.",
});

export default function GetStartedPage() {
  return (
    <main className="min-h-screen bg-[#F5F7FC] pt-20 md:pt-24">
      <Container className="w-full px-4 md:px-8">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm font-medium text-gray-600 transition-colors hover:text-[#A577FF]"
          >
            <IconArrowLeft className="size-4" />
            Back
          </Link>
          <Logo />
          <div className="w-14" aria-hidden />
        </div>
      </Container>
      <GetStartedStickySection />
    </main>
  );
}
