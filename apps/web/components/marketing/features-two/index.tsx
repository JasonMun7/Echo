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
          Deploy agents across every platform
        </Heading>
        <SubHeading className="text-balance">
          Your AI agents work seamlessly on mobile, desktop, and tablet. Monitor
          and orchestrate from anywhere.
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
          <FeatureTitle>Agents in your pocket</FeatureTitle>
          <FeatureDescription>
            Monitor workflows and receive real-time alerts on the go.
          </FeatureDescription>
        </FeatureItem>

        <FeatureItem>
          <MacbookSkeleton />
          <FeatureTitle>Full control at your desk</FeatureTitle>
          <FeatureDescription>
            Build, debug, and deploy agents with powerful desktop tools.
          </FeatureDescription>
        </FeatureItem>

        <FeatureItem>
          <IPadSkeleton />
          <FeatureTitle>Orchestrate from anywhere</FeatureTitle>
          <FeatureDescription>
            Manage complex workflows with touch-friendly dashboards.
          </FeatureDescription>
        </FeatureItem>
      </div>

      {/* Additional feature blocks */}
      <div className="mx-auto mt-16 grid max-w-5xl grid-cols-1 gap-6 md:grid-cols-3">
        <MarketingFeatureBlock
          icon={<SecuritySkeleton />}
          title="Enterprise-grade security"
          description="End-to-end encryption and SOC 2 compliance ensure your agent data stays protected across all devices."
        />
        <MarketingFeatureBlock
          icon={<EdgeComputing />}
          title="Edge computing ready"
          description="Deploy agents closer to your users with our global edge network for ultra-low latency responses."
        />
        <MarketingFeatureBlock
          icon={<Compliance />}
          title="SOC2 and HIPAA compliant"
          description="Built-in encryption and compliance features ensure your agent data stays protected across all devices."
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
