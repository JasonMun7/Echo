import Link from "next/link";
import { IconArrowLeft, IconDeviceDesktop, IconBrandApple, IconBrandWindows } from "@tabler/icons-react";
import { Container } from "@/components/marketing/container";
import { Logo } from "@/components/marketing/logo";
import { Heading } from "@/components/marketing/heading";
import { SubHeading } from "@/components/marketing/subheading";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getSEOTags } from "@/lib/seo";
import { DownloadPageClient } from "./download-page-client";

export const metadata = getSEOTags({
  title: "Download Echo Desktop | Echo",
  description: "Download Echo Desktop for Mac or Windows. Build and run AI-driven workflows locally.",
});

const MAC_URL = process.env.NEXT_PUBLIC_DESKTOP_DOWNLOAD_MAC_URL;
const WIN_URL = process.env.NEXT_PUBLIC_DESKTOP_DOWNLOAD_WIN_URL;

export default function DownloadPage() {
  return (
    <DownloadPageClient>
      <main className="flex min-h-screen items-center justify-center bg-[#F5F7FC] px-4 py-12 pt-20 md:px-8 md:py-16 md:pt-24">
        <Container className="w-full">
          <div className="mx-auto max-w-2xl space-y-8">
            <Link
              href="/"
              className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-gray-600 transition-colors hover:text-[#A577FF]"
            >
              <IconArrowLeft className="size-4" />
              Back
            </Link>
            <Logo />
            <Heading as="h1" className="mt-4 text-left text-[#150A35] lg:text-4xl">
              Download Echo Desktop
            </Heading>
            <SubHeading as="p" className="mt-4 max-w-xl text-left text-gray-600">
              Run AI-driven workflows on your machine. Choose your platform below.
            </SubHeading>

            <div className="grid gap-4 sm:grid-cols-2">
              {MAC_URL ? (
                <Button
                  asChild
                  className="echo-btn-cyan-lavender h-12 w-full gap-2 font-medium"
                >
                  <a href={MAC_URL} target="_blank" rel="noopener noreferrer">
                    <IconBrandApple className="size-5" />
                    Download for Mac
                  </a>
                </Button>
              ) : (
                <Button
                  disabled
                  className="h-12 w-full gap-2 font-medium opacity-70"
                  variant="secondary"
                >
                  <IconBrandApple className="size-5" />
                  Coming soon
                </Button>
              )}
              {WIN_URL ? (
                <Button
                  asChild
                  className="echo-btn-cyan-lavender h-12 w-full gap-2 font-medium"
                >
                  <a href={WIN_URL} target="_blank" rel="noopener noreferrer">
                    <IconBrandWindows className="size-5" />
                    Download for Windows
                  </a>
                </Button>
              ) : (
                <Button
                  disabled
                  className="h-12 w-full gap-2 font-medium opacity-70"
                  variant="secondary"
                >
                  <IconBrandWindows className="size-5" />
                  Coming soon
                </Button>
              )}
            </div>

            <Card className="echo-card border border-[#A577FF]/20 bg-[#F5F7FC] shadow-sm">
              <CardHeader>
                <CardTitle className="text-lg font-semibold text-[#150A35]">
                  Already have Echo Desktop?
                </CardTitle>
                <CardDescription className="text-gray-600">
                  Sign in to your account or check for updates in the app.
                </CardDescription>
              </CardHeader>
              <CardFooter>
                <Button asChild className="echo-btn-cyan-lavender gap-2">
                  <Link href="/sign-in">
                    <IconDeviceDesktop className="size-4" />
                    Sign in
                  </Link>
                </Button>
              </CardFooter>
            </Card>
          </div>
        </Container>
      </main>
    </DownloadPageClient>
  );
}
