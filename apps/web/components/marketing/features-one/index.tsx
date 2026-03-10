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
      <Heading>Autonomous AI workflow features</Heading>
      <SubHeading className="mt-2">
        From prototype to production, autonomously
      </SubHeading>
      <div className="mx-auto mt-8 grid grid-cols-1 gap-4 md:mt-12 md:grid-cols-3 md:grid-rows-2">
        <MarketingCard className="md:row-span-2">
          <MarketingCardContent className="flex h-full flex-col">
            <MarketingCardHeader>
              <MarketingCardTitle>Easy auth setup</MarketingCardTitle>
              <MarketingCardDescription>
                Get started in minutes with our simple authentication flow.
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
              <MarketingCardTitle>You&apos;re secure, everywhere</MarketingCardTitle>
              <MarketingCardDescription>
                Enterprise-grade security that follows your users across the
                globe. Built-in encryption, compliance, and monitoring.
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
              <MarketingCardTitle>Real-time collaboration</MarketingCardTitle>
              <MarketingCardDescription>
                Connect with your team instantly. AI-powered insights help you
                work smarter together.
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
              <MarketingCardTitle>SDK available for everything</MarketingCardTitle>
              <MarketingCardDescription>
                Native SDKs for every platform. React, Vue, iOS, Android, and
                more.
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
          title="Lightning-fast deployments"
          description="Push to production in seconds. Our CI/CD pipeline handles builds, tests, and rollbacks automatically."
        />
        <MarketingFeatureCard
          icon={<IconChartBar className="group-hover:text-[#A577FF] size-5" />}
          title="Built-in analytics"
          description="Track user behavior, monitor performance, and gain actionable insights without third-party tools."
        />
        <MarketingFeatureCard
          icon={<IconPuzzle className="group-hover:text-[#A577FF] size-5" />}
          title="Seamless integrations"
          description="Connect with your existing stack. Slack, GitHub, Jira, and 100+ integrations out of the box."
        />
      </div>
    </Container>
  );
}
