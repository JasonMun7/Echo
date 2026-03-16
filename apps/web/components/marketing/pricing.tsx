import { cn } from "@/lib/utils";
import { IconCheck, IconPlus } from "@tabler/icons-react";
import React from "react";
import Link from "next/link";
import { Container } from "./container";
import { GridLineHorizontal, GridLineVertical } from "./grid-lines";
import { Heading } from "./heading";
import { SubHeading } from "./subheading";
import { HoverBorderGradient } from "@/components/ui/hover-border-gradient";

type Plan = {
  id: string;
  name: string;
  description: string;
  price: number;
  currency: string;
  frequency: string;
  features: string[];
  additionalFeatures?: string[];
  featured?: boolean;
  buttonText: string;
};

const plans: Plan[] = [
  {
    id: "starter",
    name: "Starter",
    description: "Perfect for exploring AI agent capabilities",
    price: 19,
    currency: "USD",
    frequency: "month",
    features: [
      "3 AI Agents",
      "1,000 Task Executions",
      "Basic Workflows",
      "Email Support",
      "API Access",
    ],
    buttonText: "Get Started",
  },
  {
    id: "pro",
    name: "Pro",
    description: "For teams automating complex workflows",
    price: 79,
    currency: "USD",
    frequency: "month",
    features: [
      "Unlimited AI Agents",
      "25,000 Task Executions",
      "Advanced Workflows",
      "Priority Support",
      "API Access",
    ],
    additionalFeatures: [
      "Autonomous Decision Making",
      "Team Collaboration",
      "Workflow Orchestration",
    ],
    featured: true,
    buttonText: "Get Started",
  },
  {
    id: "enterprise",
    name: "Enterprise",
    description: "For organizations that need full autonomy",
    price: 299,
    currency: "USD",
    frequency: "month",
    features: [
      "Unlimited AI Agents",
      "Unlimited Task Executions",
      "Custom Workflow Builder",
      "24/7 Dedicated Support",
      "Dedicated Account Manager",
    ],
    additionalFeatures: ["SSO & SAML", "Audit Logs", "SLA Guarantee"],
    buttonText: "Get Started",
  },
];

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

function PricingCard({ plan }: { plan: Plan }) {
  return (
    <div
      className={cn(
        "relative rounded-lg bg-transparent p-1 sm:p-2 md:p-3",
        plan.featured &&
          "border border-[#21C4DD]/30 bg-white shadow-sm ring-1 ring-[#21C4DD]/20"
      )}
    >
      {plan.featured && (
        <>
          <GridLineHorizontal className="-top-[2px]" offset="100px" />
          <GridLineHorizontal className="-bottom-[2px]" offset="100px" />
          <GridLineVertical className="-left-[2px]" offset="100px" />
          <GridLineVertical
            className="-right-[2px] left-auto"
            offset="100px"
          />
        </>
      )}
      <div className="flex h-full flex-col justify-start gap-1 p-4">
        <div className="flex items-start justify-between">
          <p className="text-base font-medium text-[#150A35] sm:text-lg">
            {plan.name}
          </p>
          {plan.featured && (
            <span className="echo-btn-cyan-lavender rounded-full px-3 py-1 text-xs font-medium text-white">
              Popular
            </span>
          )}
        </div>
        <p className="mt-1 text-sm text-gray-600">{plan.description}</p>
        <div className="my-6">
          <span className="text-3xl font-medium text-[#150A35] md:text-4xl">
            ${plan.price}
          </span>
          <span className="ml-1 text-sm text-gray-500">
            per {plan.frequency}
          </span>
        </div>
        {plan.featured ? (
          <HoverBorderGradient
            as="div"
            containerClassName="h-11"
            className="flex h-full items-center justify-center px-6 py-2.5 font-medium"
          >
            <Link href="/get-started">{plan.buttonText}</Link>
          </HoverBorderGradient>
        ) : (
          <Link
            href="/get-started"
            className="echo-btn-secondary-accent flex h-11 w-full items-center justify-center rounded-lg font-medium"
          >
            {plan.buttonText}
          </Link>
        )}
        <div className="mt-1">
          {plan.features.map((feature, idx) => (
            <FeatureItem key={idx}>{feature}</FeatureItem>
          ))}
        </div>
        {plan.additionalFeatures && plan.additionalFeatures.length > 0 && (
          <Divider />
        )}
        <div className="py-3">
          {plan.additionalFeatures?.map((feature, idx) => (
            <FeatureItem additional key={idx}>
              {feature}
            </FeatureItem>
          ))}
        </div>
      </div>
    </div>
  );
}

function FeatureItem({
  children,
  additional,
  className,
}: {
  children: React.ReactNode;
  additional?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("my-5 flex items-start gap-2", className)}>
      <div
        className={cn(
          "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full",
          additional ? "bg-[#21C4DD]" : "bg-gray-600"
        )}
      >
        <IconCheck className="h-3 w-3 stroke-[4px] text-white" />
      </div>
      <span className="text-sm font-medium text-gray-600">{children}</span>
    </div>
  );
}

function Divider() {
  return (
    <div className="relative">
      <div className="h-px w-full bg-gray-200" />
        <div className="absolute inset-0 m-auto flex size-5 items-center justify-center rounded-xl bg-white shadow-sm ring-1 ring-[#21C4DD]/20">
        <IconPlus className="size-3 stroke-[4px] text-[#150A35]" />
      </div>
    </div>
  );
}
