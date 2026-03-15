"use client";

import React from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import Image from "next/image";
import { Badge } from "./badge";
import { HoverBorderGradient } from "@/components/ui/hover-border-gradient";

const LinesGradientShader = dynamic(
  () =>
    import("./lines-gradient-shader").then((m) => ({
      default: m.LinesGradientShader,
    })),
  {
    ssr: false,
    loading: () => (
      <div
        className="pointer-events-none absolute inset-0 overflow-hidden mask-b-from-50%"
        style={{
          background:
            "linear-gradient(to bottom, rgba(165, 119, 255, 0.08) 0%, rgba(165, 119, 255, 0.02) 100%)",
        }}
      />
    ),
  }
);

export default function Hero() {
  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-[#F5F7FC]">
      <LinesGradientShader
        className="absolute inset-0 bg-transparent"
        bandSpacing={40}
        bandThickness={100}
        waveAmplitude={0.2}
        speed={1}
      />
      <div className="relative z-10 mx-auto max-w-7xl px-4 py-12 md:px-8 md:py-32">
        <Badge href="/#product">Introducing autonomous AI workflows</Badge>

        <h1 className="mt-4 max-w-3xl text-4xl font-medium tracking-tight text-[#150A35] md:text-7xl">
          Deploy AI agents that work while you sleep.
        </h1>

        <p className="mt-4 max-w-2xl text-base text-gray-600 md:text-xl">
          Build, deploy, and orchestrate intelligent AI agents that automate
          complex workflows, make decisions, and execute tasks autonomously.
        </p>

        <div className="mt-8 flex flex-wrap items-center gap-4">
          <HoverBorderGradient
            containerClassName="h-11"
            className="flex h-full items-center gap-2 px-6 py-2.5 font-medium"
          >
            <Link href="/get-started" className="flex items-center gap-2">
              Get started
              <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="ml-1 inline-block"
            >
              <path d="M5 12h14" />
              <path d="m12 5 7 7-7 7" />
            </svg>
            </Link>
          </HoverBorderGradient>
          <Link
            href="/#product"
            className="echo-btn-secondary-accent flex h-11 items-center rounded-lg px-6 font-medium"
          >
            Learn More
          </Link>
        </div>

        <div className="mt-16 md:mt-24">
          <div className="relative mx-auto max-w-full">
            <div className="overflow-hidden rounded-xl border border-[#21C4DD]/20 bg-white/90 shadow-sm backdrop-blur-sm">
              <div className="flex items-center gap-2 border-b border-gray-200/80 px-4 py-3">
                <div className="flex items-center gap-1.5">
                  <div className="size-3 rounded-full bg-red-500" />
                  <div className="size-3 rounded-full bg-yellow-500" />
                  <div className="size-3 rounded-full bg-green-500" />
                </div>
                <div className="flex-1 text-center">
                  <span className="text-xs text-gray-500">app.echo.ai</span>
                </div>
                <div className="w-12" />
              </div>
              <div className="relative aspect-[16/10] w-full">
                <Image
                  src="/dashboard@3x.png"
                  width={1000}
                  height={625}
                  alt="Dashboard Preview"
                  className="h-full w-full object-cover object-top"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
