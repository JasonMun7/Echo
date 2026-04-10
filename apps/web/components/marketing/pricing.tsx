import React from "react";
import Link from "next/link";
import { Container } from "./container";
import { Heading } from "./heading";
import { SubHeading } from "./subheading";
import { HoverBorderGradient } from "@/components/ui/hover-border-gradient";

export function Pricing() {
  return (
    <Container as="section" className="flex w-full flex-col">
      <div className="relative mx-auto my-12 flex w-full max-w-3xl flex-1 flex-col items-center px-4 py-0 text-center md:my-16">
        <Heading
          as="h2"
          className="pt-4 text-2xl font-bold tracking-tight text-[#150A35] md:text-4xl"
        >
          Early Access
        </Heading>
        <SubHeading
          as="p"
          className="mx-auto mt-4 max-w-md text-center text-base text-gray-600"
        >
          Echo is currently in private beta. We&apos;re onboarding teams and
          individuals who want to automate their most time-consuming workflows
          — including accessibility-focused use cases.
        </SubHeading>

        <div className="mt-10 w-full max-w-md rounded-xl border border-[#A577FF]/20 bg-white p-8 shadow-sm">
          <div className="flex flex-col items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#A577FF]/10">
              <span className="text-2xl">⚡</span>
            </div>
            <h3 className="text-lg font-semibold text-[#150A35]">
              Request early access
            </h3>
            <p className="text-sm text-gray-500 text-center">
              Get access to the Echo desktop app, voice agent, and workflow
              builder. No credit card required.
            </p>
            <HoverBorderGradient
              as="div"
              containerClassName="h-11 w-full"
              className="flex h-full w-full items-center justify-center px-6 py-2.5 font-medium"
            >
              <Link href="/sign-up">Join the waitlist</Link>
            </HoverBorderGradient>
          </div>
        </div>
      </div>
    </Container>
  );
}
