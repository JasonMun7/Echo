"use client";

import Link from "next/link";
import {
  IconDownload,
  IconPackage,
  IconLogin,
  IconBrandApple,
  IconBrandWindows,
  IconRocket,
} from "@tabler/icons-react";
import { StickyScroll, type StickyScrollItem } from "@/block/features-with-sticky-scroll";
import { Button } from "@/components/ui/button";
import GradientText from "@/components/reactbits/GradientText";
import { DesktopCaptureLink } from "@/components/desktop-capture-link";

const MAC_URL = process.env.NEXT_PUBLIC_DESKTOP_DOWNLOAD_MAC_URL;
const WIN_URL = process.env.NEXT_PUBLIC_DESKTOP_DOWNLOAD_WIN_URL;

const steps: StickyScrollItem[] = [
  {
    icon: <IconDownload className="h-12 w-12 lg:h-14 lg:w-14" />,
    title: "Step 1: Download Echo Desktop",
    description:
      "Get the app for Mac or Windows. Choose your platform and download the installer—one click and you're ready.",
    content: (
      <div className="flex min-h-[480px] flex-col items-center justify-center rounded-xl border border-[#A577FF]/20 bg-white p-8 shadow-sm md:p-12">
        <div className="flex flex-col items-center gap-8">
          <div className="flex h-32 w-32 items-center justify-center rounded-2xl border-2 border-[#A577FF]/40 bg-[#A577FF]/10">
            <IconDownload className="h-16 w-16 text-[#A577FF]" />
          </div>
          <div className="flex w-full max-w-md flex-col gap-4 sm:flex-row sm:gap-6">
            {MAC_URL ? (
              <Button
                asChild
                className="echo-btn-cyan-lavender h-14 flex-1 gap-3 text-base font-semibold"
              >
                <a href={MAC_URL} target="_blank" rel="noopener noreferrer">
                  <IconBrandApple className="h-6 w-6" />
                  Download for Mac
                </a>
              </Button>
            ) : (
              <Button
                disabled
                className="h-14 flex-1 gap-3 text-base font-semibold opacity-70"
                variant="secondary"
              >
                <IconBrandApple className="h-6 w-6" />
                Coming soon
              </Button>
            )}
            {WIN_URL ? (
              <Button
                asChild
                className="echo-btn-cyan-lavender h-14 flex-1 gap-3 text-base font-semibold"
              >
                <a href={WIN_URL} target="_blank" rel="noopener noreferrer">
                  <IconBrandWindows className="h-6 w-6" />
                  Download for Windows
                </a>
              </Button>
            ) : (
              <Button
                disabled
                className="h-14 flex-1 gap-3 text-base font-semibold opacity-70"
                variant="secondary"
              >
                <IconBrandWindows className="h-6 w-6" />
                Coming soon
              </Button>
            )}
          </div>
          <p className="text-center text-sm text-gray-600">
            Already have the app?{" "}
            <Link
              href="/sign-in"
              className="font-medium text-[#A577FF] hover:underline"
            >
              Sign in
            </Link>
          </p>
        </div>
      </div>
    ),
  },
  {
    icon: <IconPackage className="h-12 w-12 lg:h-14 lg:w-14" />,
    title: "Step 2: Install and open",
    description:
      "Run the installer and launch Echo Desktop. Grant screen recording permission when prompted so the app can capture workflows.",
    content: (
      <div className="flex min-h-[480px] flex-col items-center justify-center rounded-xl border border-[#A577FF]/20 bg-white p-8 shadow-sm md:p-12">
        <div className="flex flex-col items-center gap-8">
          <div className="flex h-32 w-32 items-center justify-center rounded-2xl border-2 border-echo-cyan/40 bg-echo-cyan/10">
            <IconPackage className="h-16 w-16 text-echo-cyan" />
          </div>
          <p className="text-center text-lg font-medium text-[#150A35]">
            Run the installer, then open Echo Desktop
          </p>
          <p className="text-center text-base text-gray-600">
            Enable screen recording when asked—required for workflow capture.
          </p>
        </div>
      </div>
    ),
  },
  {
    icon: <IconLogin className="h-12 w-12 lg:h-14 lg:w-14" />,
    title: "Step 3: Open & sign in",
    description:
      "Click Sign in in the app. You'll complete authentication in your browser and return to the desktop—your workflows stay in sync.",
    content: (
      <div className="flex min-h-[480px] flex-col items-center justify-center rounded-xl border border-[#A577FF]/20 bg-white p-8 shadow-sm md:p-12">
        <div className="flex flex-col items-center gap-8">
          <div className="flex h-32 w-32 items-center justify-center rounded-2xl border-2 border-[#A577FF]/40 bg-[#A577FF]/10">
            <IconLogin className="h-16 w-16 text-[#A577FF]" />
          </div>
          <Button asChild className="echo-btn-cyan-lavender h-14 gap-3 px-8 text-base font-semibold">
            <Link href="/sign-in">
              <IconLogin className="h-6 w-6" />
              Sign in
            </Link>
          </Button>
          <p className="text-center text-base text-gray-600">
            You&apos;ll complete sign-in in your browser, then return to the app.
          </p>
        </div>
      </div>
    ),
  },
];

export function GetStartedStickySection() {
  return (
    <section className="relative w-full bg-[#F5F7FC] pt-16 pb-24 md:pt-20 md:pb-32">
      <div className="mx-auto max-w-7xl px-6 text-center">
        <h2 className="flex flex-wrap items-baseline justify-center gap-x-2 text-3xl font-semibold text-[#150A35] md:text-4xl lg:text-5xl">
          <span>Get started with</span>
          <GradientText className="inline-block align-baseline">
            Echo Desktop
          </GradientText>
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-lg text-gray-600 md:text-xl">
          Download, install, and sign in to start building AI-driven workflows on your machine.
        </p>
      </div>
      <StickyScroll content={steps} theme="echo" />

      <div className="mx-auto max-w-3xl px-6 pb-24 text-center md:pb-32">
        <div className="rounded-2xl border border-[#A577FF]/20 bg-white/80 p-8 shadow-sm backdrop-blur-sm md:p-12">
          <p className="flex flex-wrap items-baseline justify-center gap-x-2 text-center text-2xl font-semibold text-[#150A35] md:text-3xl lg:text-4xl">
            <span>Now let&apos;s create</span>
            <GradientText className="inline-block align-baseline">
              AI-powered GUI workflows
            </GradientText>
          </p>
          <p className="mt-4 text-lg text-gray-600">
            Record your screen, describe what you want, and Echo turns it into automations that run in the desktop app.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <Button asChild className="echo-btn-cyan-lavender h-12 gap-2 px-6 text-base font-semibold">
              <DesktopCaptureLink>
                <IconRocket className="h-5 w-5" />
                Open Echo Desktop to record
              </DesktopCaptureLink>
            </Button>
            <Button asChild variant="secondary" className="h-12 border-[#A577FF]/40 px-6 text-base font-medium text-[#150A35] hover:bg-[#A577FF]/10">
              <Link href="/dashboard">Go to dashboard</Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
