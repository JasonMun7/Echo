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
    <main className="flex min-h-screen items-center justify-center bg-[#F5F7FC] py-8">
      <Container className="w-full px-4 md:px-8">
        <div className="grid grid-cols-1 gap-10 md:grid-cols-2 lg:gap-40">
          <div>
            <Link
              href="/"
              className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-gray-600 transition-colors hover:text-[#150A35]"
            >
              <IconArrowLeft className="size-4" />
              Back
            </Link>
            <Logo />
            <Heading as="h1" className="mt-4 text-left lg:text-4xl">
              Welcome back!
            </Heading>
            <SubHeading as="p" className="mt-4 max-w-xl text-left">
              We empower developers and technical teams to create, simulate, and
              manage AI-driven workflows visually
            </SubHeading>
            <Suspense fallback={<LoaderFive text="Loading…" />}>
              <AuthForm mode="sign-in" />
            </Suspense>
          </div>
          <AuthIllustration />
        </div>
      </Container>
    </main>
  );
}
