"use client";
import React from "react";
import { WorldMapSkeleton } from "./world-map-skeleton";
import { KeyboardSkeleton } from "./keyboard-skeleton";
import { LoginSkeleton } from "./login-skeleton";
import { ChatConversation } from "./chat";
import { VerticalPulseLines } from "./vertical-pulse-lines";
import { FlippingImagesWithBar } from "./flipping-images";
import { Heading } from "@/components/marketing/heading";
import { SubHeading } from "@/components/marketing/subheading";
import { Container } from "@/components/marketing/container";
import {
  MarketingCard,
  MarketingCardContent,
  MarketingCardHeader,
  MarketingCardTitle,
  MarketingCardDescription,
  MarketingCardSkeleton,
  MarketingFeatureCard,
} from "@/components/marketing/primitives";
import {
  IconBolt,
  IconChartBar,
  IconPuzzle,
} from "@tabler/icons-react";

export function FeaturesOne() {
  return (
    <Container as="section" id="product" className="py-10 md:py-20 lg:py-32">
      <Heading>How Echo works</Heading>
      <SubHeading className="mt-2">
        Show it once. Run it forever.
      </SubHeading>
      <div className="mx-auto mt-8 grid grid-cols-1 gap-4 md:mt-12 md:grid-cols-3 md:grid-rows-2">
        <MarketingCard className="md:row-span-2">
          <MarketingCardContent className="flex h-full flex-col">
            <MarketingCardHeader>
              <MarketingCardTitle>Show Echo what to do</MarketingCardTitle>
              <MarketingCardDescription>
                Record a video or take screenshots of any workflow. Gemini 2.5
                Pro synthesizes it into a step-by-step AI plan in seconds.
              </MarketingCardDescription>
            </MarketingCardHeader>
            <MarketingCardSkeleton className="mt-auto flex flex-1 items-center justify-center overflow-hidden pt-4">
              <LoginSkeleton />
            </MarketingCardSkeleton>
          </MarketingCardContent>
        </MarketingCard>

        <MarketingCard>
          <MarketingCardContent className="flex h-full flex-col">
            <MarketingCardHeader>
              <MarketingCardTitle>Live vision execution</MarketingCardTitle>
              <MarketingCardDescription>
                EchoPrism watches your screen in real time, deciding each click
                and keystroke using OmniParser grounding — not blind guessing.
              </MarketingCardDescription>
            </MarketingCardHeader>
            <MarketingCardSkeleton className="mt-auto flex flex-1 items-center justify-center pt-4">
              <WorldMapSkeleton />
            </MarketingCardSkeleton>
          </MarketingCardContent>
        </MarketingCard>

        <MarketingCard className="md:row-span-2">
          <MarketingCardContent className="flex h-full flex-col">
            <MarketingCardHeader>
              <MarketingCardTitle>Voice control, anytime</MarketingCardTitle>
              <MarketingCardDescription>
                Say &ldquo;run my report&rdquo; to start, or interrupt
                mid-run to redirect. EchoPrism listens via LiveKit + Gemini
                Live and responds instantly.
              </MarketingCardDescription>
            </MarketingCardHeader>
            <MarketingCardSkeleton className="mt-auto flex flex-1 flex-col items-center justify-between gap-2 overflow-hidden pt-4">
              <ChatConversation className="min-h-0 shrink p-2" />
              <VerticalPulseLines className="h-24 shrink-0" />
              <div className="shrink-0 scale-75">
                <FlippingImagesWithBar />
              </div>
            </MarketingCardSkeleton>
          </MarketingCardContent>
        </MarketingCard>

        <MarketingCard>
          <MarketingCardContent className="flex h-full flex-col">
            <MarketingCardHeader>
              <MarketingCardTitle>Browser &amp; desktop, natively</MarketingCardTitle>
              <MarketingCardDescription>
                Works on any web app in Chrome and on native desktop apps
                through our Electron agent. No browser extension needed.
              </MarketingCardDescription>
            </MarketingCardHeader>
            <MarketingCardSkeleton className="mt-auto flex flex-1 items-center justify-center overflow-hidden mask-r-from-50% pt-4">
              <KeyboardSkeleton />
            </MarketingCardSkeleton>
          </MarketingCardContent>
        </MarketingCard>
      </div>

      <div className="mx-auto mt-4 grid grid-cols-1 gap-4 md:mt-12 md:grid-cols-3">
        <MarketingFeatureCard
          icon={<IconBolt className="group-hover:text-[#A577FF] size-5" />}
          title="Gemini-powered"
          description="Vision, synthesis, and native audio all run on Gemini 2.5 Pro — the same model that sees, thinks, and speaks."
        />
        <MarketingFeatureCard
          icon={<IconPuzzle className="group-hover:text-[#A577FF] size-5" />}
          title="Connect your tools"
          description="Deep integrations with Slack, Gmail, GitHub, Notion, Google Sheets, Google Calendar, and Linear."
        />
        <MarketingFeatureCard
          icon={<IconChartBar className="group-hover:text-[#A577FF] size-5" />}
          title="Built on Google Cloud"
          description="Cloud Run, Firestore, Vertex AI, and GCS — enterprise-grade infrastructure with zero servers to manage."
        />
      </div>
    </Container>
  );
}
