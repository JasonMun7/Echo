"use client";

import React, { useId } from "react";
import Image from "next/image";
import { IconMailFilled } from "@tabler/icons-react";
import { cn } from "@/lib/utils";
import { motion } from "motion/react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { StatefulButton } from "@/components/ui/stateful-button";

export function ContactFormGridWithDetails() {
  const handleSubmit = async (_e: React.MouseEvent<HTMLButtonElement>) => {
    // Placeholder: wire up to your backend
    await new Promise((r) => setTimeout(r, 800));
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-10 md:px-6 md:py-20">
      <div className="mx-auto grid w-full max-w-7xl grid-cols-1 gap-10 lg:grid-cols-2">
      <div className="relative flex flex-col items-center overflow-hidden lg:items-start">
        <div className="flex items-start justify-start">
          <FeatureIconContainer className="flex items-center justify-center overflow-hidden">
            <IconMailFilled className="h-6 w-6 text-[#21C4DD]" />
          </FeatureIconContainer>
        </div>
        <h2 className="mt-9 bg-gradient-to-b from-[#150A35] to-[#2d1b69] bg-clip-text text-left text-xl font-bold text-transparent md:text-3xl lg:text-5xl">
          Contact us
        </h2>
        <p className="mt-8 max-w-lg text-center text-base text-gray-600 md:text-left">
          We are always looking for ways to improve our products and services.
          Contact us and let us know how we can help you.
        </p>

        <div className="mt-10 flex flex-col flex-wrap items-center gap-4 md:flex-row">
          <a
            href="mailto:contact@echo.ai"
            className="text-sm font-medium text-[#21C4DD] hover:underline"
          >
            contact@echo.ai
          </a>
          <div className="hidden h-1 w-1 rounded-full bg-[#A577FF]/40 md:block" />
          <p className="text-sm text-gray-500">+1 (800) 123-4567</p>
          <div className="hidden h-1 w-1 rounded-full bg-[#A577FF]/40 md:block" />
          <a
            href="mailto:support@echo.ai"
            className="text-sm font-medium text-[#21C4DD] hover:underline"
          >
            support@echo.ai
          </a>
        </div>
        <div className="relative mt-20 flex w-[min(500px,100%)] flex-shrink-0 items-center justify-center [perspective:800px] [transform-style:preserve-3d]">
          <ContactMapPin className="top-0 right-1" />
          <Image
            src="https://assets.aceternity.com/pro/world.svg"
            width={500}
            height={500}
            alt="World map"
            className="[transform:rotateX(45deg)_translateZ(0px)] invert opacity-90"
          />
        </div>
      </div>

      <div className="relative mx-auto flex w-full max-w-2xl flex-col items-start gap-4 overflow-hidden rounded-2xl border border-[#21C4DD]/20 bg-white p-6 shadow-sm sm:p-10">
        <Grid size={20} />
        <form
          onSubmit={(e) => e.preventDefault()}
          className="relative z-20 flex w-full flex-col gap-4"
        >
          <div className="w-full">
            <Label
              htmlFor="name"
              className="mb-2 block text-sm font-medium text-[#150A35]"
            >
              Full name
            </Label>
            <Input
              id="name"
              type="text"
              placeholder="Your name"
              variant="plain"
              className="h-10 w-full rounded-lg border border-[#A577FF]/20 bg-[#F5F7FC] pl-4 text-sm text-[#150A35] placeholder:text-gray-500 focus-visible:ring-2 focus-visible:ring-[#A577FF]/40"
            />
          </div>
          <div className="w-full">
            <Label
              htmlFor="email"
              className="mb-2 block text-sm font-medium text-[#150A35]"
            >
              Email address
            </Label>
            <Input
              id="email"
              type="email"
              placeholder="you@example.com"
              variant="plain"
              className="h-10 w-full rounded-lg border border-[#A577FF]/20 bg-[#F5F7FC] pl-4 text-sm text-[#150A35] placeholder:text-gray-500 focus-visible:ring-2 focus-visible:ring-[#A577FF]/40"
            />
          </div>
          <div className="w-full">
            <Label
              htmlFor="company"
              className="mb-2 block text-sm font-medium text-[#150A35]"
            >
              Company
            </Label>
            <Input
              id="company"
              type="text"
              placeholder="Your company"
              variant="plain"
              className="h-10 w-full rounded-lg border border-[#A577FF]/20 bg-[#F5F7FC] pl-4 text-sm text-[#150A35] placeholder:text-gray-500 focus-visible:ring-2 focus-visible:ring-[#A577FF]/40"
            />
          </div>
          <div className="w-full">
            <Label
              htmlFor="message"
              className="mb-2 block text-sm font-medium text-[#150A35]"
            >
              Message
            </Label>
            <Textarea
              id="message"
              rows={5}
              placeholder="Type your message here"
              className="min-h-24 w-full rounded-lg border border-[#A577FF]/20 bg-[#F5F7FC] px-4 py-3 text-sm text-[#150A35] placeholder:text-gray-500 focus-visible:ring-2 focus-visible:ring-[#A577FF]/40"
            />
          </div>
          <StatefulButton
            type="submit"
            onClick={handleSubmit}
            className="mt-2 w-full sm:w-auto"
          >
            Send message
          </StatefulButton>
        </form>
      </div>
    </div>
    </div>
  );
}

function ContactMapPin({ className }: { className?: string }) {
  return (
    <motion.div
      style={{ transform: "translateZ(1px)" }}
      className={cn(
        "pointer-events-none absolute z-[60] flex h-40 w-96 items-center justify-center opacity-100 transition duration-500",
        className
      )}
    >
      <div className="h-full w-full">
        <div className="absolute inset-x-0 top-0 z-20 mx-auto inline-block w-fit rounded-lg border border-[#21C4DD]/30 bg-white px-2 py-1 text-xs font-medium text-[#150A35] shadow-sm">
          We are here
          <span className="absolute -bottom-0 left-[1.125rem] h-px w-[calc(100%-2.25rem)] bg-gradient-to-r from-transparent via-[#21C4DD] to-transparent" />
        </div>
        <div
          style={{
            perspective: "800px",
            transform: "rotateX(70deg) translateZ(0px)",
          }}
          className="absolute top-1/2 left-1/2 mt-4 ml-[0.09375rem] -translate-x-1/2 -translate-y-1/2"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: [0, 1, 0.5, 0], scale: 1 }}
            transition={{ duration: 6, repeat: Infinity, delay: 0 }}
            className="absolute top-1/2 left-1/2 h-20 w-20 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#21C4DD]/15 shadow-[0_8px_16px_rgb(0_0_0/0.2)]"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: [0, 1, 0.5, 0], scale: 1 }}
            transition={{ duration: 6, repeat: Infinity, delay: 2 }}
            className="absolute top-1/2 left-1/2 h-20 w-20 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#21C4DD]/15 shadow-[0_8px_16px_rgb(0_0_0/0.2)]"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: [0, 1, 0.5, 0], scale: 1 }}
            transition={{ duration: 6, repeat: Infinity, delay: 4 }}
            className="absolute top-1/2 left-1/2 h-20 w-20 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#21C4DD]/15 shadow-[0_8px_16px_rgb(0_0_0/0.2)]"
          />
        </div>
        <motion.div className="absolute right-1/2 bottom-1/2 h-20 w-px translate-y-[14px] bg-gradient-to-b from-transparent to-[#21C4DD] blur-[2px]" />
        <motion.div className="absolute right-1/2 bottom-1/2 h-20 w-px translate-y-[14px] bg-gradient-to-b from-transparent to-[#21C4DD]" />
        <motion.div className="absolute right-1/2 bottom-1/2 z-40 h-[4px] w-[4px] translate-x-[1.5px] translate-y-[14px] rounded-full bg-[#21C4DD] blur-[3px]" />
        <motion.div className="absolute right-1/2 bottom-1/2 z-40 h-[2px] w-[2px] translate-x-[0.5px] translate-y-[14px] rounded-full bg-[#21C4DD]" />
      </div>
    </motion.div>
  );
}

const FeatureIconContainer = ({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) => {
  return (
    <div
      className={cn(
        "relative h-14 w-14 rounded-lg border border-[#21C4DD]/30 bg-gradient-to-b from-[#F5F7FC] to-white p-[4px] shadow-sm",
        className
      )}
    >
      <div className="relative z-20 flex h-full w-full items-center justify-center rounded-[6px] bg-[#F5F7FC]">
        {children}
      </div>
      <div className="absolute inset-x-0 bottom-0 mx-auto h-px w-[60%] bg-gradient-to-r from-transparent via-[#21C4DD]/60 to-transparent" />
    </div>
  );
};

const Grid = ({
  pattern,
  size,
}: {
  pattern?: number[][];
  size?: number;
}) => {
  const p =
    pattern ??
    ([[7, 2], [10, 4], [8, 6], [11, 3], [9, 5]] as number[][]);
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden opacity-[0.03]">
      <div className="absolute inset-0">
        <GridPattern
          width={size ?? 20}
          height={size ?? 20}
          x="-12"
          y="4"
          squares={p}
          className="h-full w-full fill-[#150A35] stroke-[#150A35]"
        />
      </div>
    </div>
  );
};

function GridPattern({
  width,
  height,
  x,
  y,
  squares,
  className,
  ...props
}: {
  width: number;
  height: number;
  x: string;
  y: string;
  squares: number[][];
} & React.SVGProps<SVGSVGElement>) {
  const patternId = useId();

  return (
    <svg aria-hidden="true" className={className} {...props}>
      <defs>
        <pattern
          id={patternId}
          width={width}
          height={height}
          patternUnits="userSpaceOnUse"
          x={x}
          y={y}
        >
          <path d={`M.5 ${height}V.5H${width}`} fill="none" stroke="currentColor" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" strokeWidth={0} fill={`url(#${patternId})`} />
      <svg x={x} y={y} className="overflow-visible">
        {squares.map(([sx, sy], idx) => (
          <rect
            key={`${sx}-${sy}-${idx}`}
            strokeWidth={0}
            width={width + 1}
            height={height + 1}
            x={sx * width}
            y={sy * height}
            fill="currentColor"
          />
        ))}
      </svg>
    </svg>
  );
}
