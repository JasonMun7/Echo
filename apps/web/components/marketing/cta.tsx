"use client";

import { IconArrowRight } from "@tabler/icons-react";
import Image from "next/image";
import Link from "next/link";
import { HoverBorderGradient } from "@/components/ui/hover-border-gradient";
import { Heading } from "./heading";
import { SubHeading } from "./subheading";
import { motion, useScroll, useSpring, useTransform } from "motion/react";
import { useRef } from "react";

const images = [
  {
    src: "https://assets.aceternity.com/components/pricing-minimal.webp",
    alt: "Creative product workspace",
  },
  {
    src: "https://assets.aceternity.com/components/contact-section-with-shader.webp",
    alt: "Team collaboration",
  },
  {
    src: "https://assets.aceternity.com/components/feature-section-with-bento-skeletons.webp",
    alt: "Developer dashboard",
  },
  {
    src: "https://assets.aceternity.com/components/features-with-isometric-blocks.webp",
    alt: "Design system",
  },
  {
    src: "https://assets.aceternity.com/components/illustrations.webp",
    alt: "Code editor",
  },
  {
    src: "https://assets.aceternity.com/components/globe-3.webp",
    alt: "UI mockups",
  },
];

const SPRING_CONFIG = { stiffness: 100, damping: 50 };

export function CTA() {
  const target = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target,
    offset: ["start start", "end end"],
  });
  const translateY = useSpring(
    useTransform(scrollYProgress, [0, 1], [0, 100]),
    SPRING_CONFIG
  );
  const translateYNegative = useSpring(
    useTransform(scrollYProgress, [0, 1], [0, -100]),
    SPRING_CONFIG
  );

  return (
    <section
      ref={target}
      className="mx-auto my-10 grid w-full max-w-7xl grid-cols-1 items-center gap-10 px-4 md:my-16 md:grid-cols-2 md:gap-16 md:px-8"
    >
      <div className="max-w-xl">
        <Heading
          as="h2"
          className="text-3xl font-bold tracking-tight text-balance text-[#150A35] md:text-4xl"
        >
          Start building autonomous workflows today.
        </Heading>
        <SubHeading
          as="p"
          className="mt-6 max-w-lg text-base text-gray-600 md:text-base"
        >
          Build, deploy, and orchestrate intelligent AI agents that automate
          complex workflows, make decisions, and execute tasks autonomously.
        </SubHeading>
        <HoverBorderGradient
          containerClassName="mt-6 h-11"
          className="flex h-full items-center gap-2 px-6 py-2.5 font-medium"
        >
          <Link href="/sign-in" className="flex items-center gap-2">
            Get Started
            <IconArrowRight className="h-4 w-4" />
          </Link>
        </HoverBorderGradient>
      </div>

      <div className="relative max-h-[560px] overflow-hidden rounded-2xl border border-[#21C4DD]/15 bg-white/80 p-3">
        <div className="grid h-full grid-cols-2 gap-3">
          <motion.div className="flex flex-col gap-3" style={{ y: translateY }}>
            {images.slice(0, 3).map((img) => (
              <div
                key={img.src}
                className="overflow-hidden rounded-xl shadow-sm ring-1 ring-[#21C4DD]/10"
              >
                <Image
                  src={img.src}
                  alt={img.alt}
                  width={500}
                  height={320}
                  className="h-44 w-full object-cover"
                />
              </div>
            ))}
          </motion.div>
          <motion.div
            className="mt-10 flex flex-col gap-3"
            style={{ y: translateYNegative }}
          >
            {images.slice(3).map((img) => (
              <div
                key={img.src}
                className="overflow-hidden rounded-xl shadow-sm ring-1 ring-[#21C4DD]/10"
              >
                <Image
                  src={img.src}
                  alt={img.alt}
                  width={500}
                  height={320}
                  className="h-44 w-full object-cover"
                />
              </div>
            ))}
          </motion.div>
        </div>
      </div>
    </section>
  );
}
