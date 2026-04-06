"use client";
import React from "react";
import { motion } from "motion/react";
import { Container } from "@/components/marketing/container";
import { Heading } from "@/components/marketing/heading";
import { SubHeading } from "@/components/marketing/subheading";
import { MarketingFeatureBlock } from "@/components/marketing/primitives";
import { AnimatedBeamPathIllustration } from "./animated-path";
import { SecuritySkeleton } from "./security-skeleton";
import { MacbookSkeleton } from "./macbook-skeleton";
import { IPhoneSkeleton } from "./iphone-skeleton";
import { IPadSkeleton } from "./ipad-skeleton";
import { EdgeComputing } from "./edge-computing";
import { Compliance } from "./compliance";

export function FeaturesTwo() {
  return (
    <Container className="px-4 py-10 md:py-20 lg:py-32">
      <div className="mx-auto mb-16 max-w-2xl text-center">
        <Heading as="h2" className="mb-4">
          Run Echo anywhere
        </Heading>
        <SubHeading className="text-balance">
          From your web dashboard to your desktop to your voice — Echo is always
          one command away.
        </SubHeading>
      </div>

      {/* Animated beam row - visible only on lg screens */}
      <div className="relative mx-auto mb-8 hidden h-12 w-full items-center lg:flex">
        <div className="relative flex h-full w-full items-center">
          <div className="absolute top-1/2 left-[calc(100%/6)] z-10 -translate-x-1/2 -translate-y-1/2">
            <BeamCircle />
          </div>
          <div className="absolute top-1/2 left-1/2 z-10 -translate-x-1/2 -translate-y-1/2">
            <BeamCircle />
          </div>
          <div className="absolute top-1/2 left-[calc(500%/6)] z-10 -translate-x-1/2 -translate-y-1/2">
            <BeamCircle />
          </div>
          <div className="absolute top-1/2 left-[calc(100%/6)] w-[calc(200%/6)] -translate-y-1/2">
            <AnimatedBeamPathIllustration />
          </div>
          <div className="absolute top-1/2 left-[calc(300%/6)] w-[calc(200%/6)] -translate-y-1/2">
            <AnimatedBeamPathIllustration delay={1.4} />
          </div>
        </div>
      </div>

      {/* Device skeletons row */}
      <div className="mx-auto grid w-full grid-cols-1 items-center gap-10 overflow-hidden py-4 md:grid-cols-3 md:flex-row md:items-end md:justify-center md:py-10">
        <FeatureItem>
          <IPhoneSkeleton />
          <FeatureTitle>Voice from any device</FeatureTitle>
          <FeatureDescription>
            Trigger any workflow hands-free. Say it, and EchoPrism handles the
            rest — no mouse, no keyboard needed.
          </FeatureDescription>
        </FeatureItem>

        <FeatureItem>
          <MacbookSkeleton />
          <FeatureTitle>Full desktop control</FeatureTitle>
          <FeatureDescription>
            Browser tabs, native apps, system dialogs — EchoPrism sees and
            controls your entire screen.
          </FeatureDescription>
        </FeatureItem>

        <FeatureItem>
          <IPadSkeleton />
          <FeatureTitle>Web dashboard</FeatureTitle>
          <FeatureDescription>
            Monitor live runs, review thought logs, share workflows, and manage
            your team from anywhere.
          </FeatureDescription>
        </FeatureItem>
      </div>

      {/* Additional feature blocks */}
      <div className="mx-auto mt-16 grid max-w-5xl grid-cols-1 gap-6 md:grid-cols-3">
        <MarketingFeatureBlock
          icon={<SecuritySkeleton />}
          title="Live thought stream"
          description="See exactly what EchoPrism is thinking at every step — full transparency into your agent's reasoning and actions."
        />
        <MarketingFeatureBlock
          icon={<EdgeComputing />}
          title="Visual grounding, not guessing"
          description="OmniParser detects real UI elements. EchoPrism clicks what it sees — not estimated coordinates."
        />
        <MarketingFeatureBlock
          icon={<Compliance />}
          title="Gets smarter over time"
          description="Every completed run is scored and used to fine-tune your personal Echo model — it learns your workflows."
        />
      </div>
    </Container>
  );
}

function FeatureItem({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      whileHover="animate"
      initial="initial"
      className="flex min-w-60 flex-col items-center"
    >
      {children}
    </motion.div>
  );
}

function BeamCircle() {
  return (
    <div className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-neutral-200">
      <div className="h-2 w-2 rounded-full bg-[#A577FF]" />
    </div>
  );
}

function FeatureTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mt-6 text-center text-base font-medium text-neutral-900">
      {children}
    </h3>
  );
}

function FeatureDescription({ children }: { children: React.ReactNode }) {
  return (
    <p className="mx-auto mt-2 max-w-xs text-center text-sm text-balance text-neutral-500">
      {children}
    </p>
  );
}
