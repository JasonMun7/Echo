import { Suspense } from "react";
import Link from "next/link";
import { IconArrowLeft } from "@tabler/icons-react";
import { Container } from "@/components/marketing/container";
import { Logo } from "@/components/marketing/logo";
import { Heading } from "@/components/marketing/heading";
import { SubHeading } from "@/components/marketing/subheading";
import { AuthIllustration } from "@/components/marketing/auth-illustration";
import { AuthForm } from "@/components/marketing/auth-form";
import { LoaderFive } from "@/components/ui/loader";
import { getSEOTags } from "@/lib/seo";

export const metadata = getSEOTags({
  title: "Sign In | Echo",
  description: "Sign in to Echo and start building AI-driven workflows.",
});

export default function SignInPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-white px-4 py-12 pt-20 md:px-8 md:py-16 md:pt-24">
      <Container className="w-full">
        <div className="grid grid-cols-1 gap-10 md:grid-cols-2 lg:gap-16">
          <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm md:p-8">
            <Link
              href="/"
              className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-gray-600 transition-colors hover:text-[#A577FF]"
            >
              <IconArrowLeft className="size-4" />
              Back
            </Link>
            <Logo />
            <Heading as="h1" className="mt-4 text-left text-[#150A35] lg:text-4xl">
              Welcome back!
            </Heading>
            <SubHeading as="p" className="mt-4 max-w-xl text-left text-gray-600">
              We empower developers and technical teams to create, simulate, and
              manage AI-driven workflows visually
            </SubHeading>
            <Suspense fallback={<LoaderFive text="Loading…" />}>
              <AuthForm mode="sign-in" />
            </Suspense>
          </div>
          <div className="echo-gradient-secondary flex min-h-80 items-end overflow-hidden rounded-2xl p-4 md:min-h-96 md:p-8">
            <AuthIllustration />
          </div>
        </div>
      </Container>
    </main>
  );
}
