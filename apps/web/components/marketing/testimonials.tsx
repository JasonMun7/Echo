"use client";

import React, { useRef } from "react";
import { motion, useInView } from "motion/react";
import Image from "next/image";
import Link from "next/link";
import { Heading } from "./heading";
import { SubHeading } from "./subheading";
import { HoverBorderGradient } from "@/components/ui/hover-border-gradient";

const TESTIMONIALS = [
  {
    title: "Best investment for our startup",
    quote:
      "We deployed AI agents that automated our entire workflow overnight. The autonomous execution is exactly what we needed.",
    imageSrc: "https://assets.aceternity.com/avatars/manu.webp",
    name: "Sarah Chen",
  },
  {
    title: "Exceeded all expectations",
    quote:
      "The AI agents handle complex decisions while we sleep. Our team's productivity has increased tenfold.",
    imageSrc: "https://assets.aceternity.com/avatars/1.webp",
    name: "Marcus Johnson",
  },
  {
    title: "Game changer for our team",
    quote:
      "Orchestrating intelligent workflows used to take weeks. Now our AI agents handle everything autonomously.",
    imageSrc: "https://assets.aceternity.com/avatars/2.webp",
    name: "Emily Rodriguez",
  },
  {
    title: "Worth every penny",
    quote:
      "Building and deploying AI agents is incredibly simple. Our automation runs 24/7 without any human intervention.",
    imageSrc: "https://assets.aceternity.com/avatars/3.webp",
    name: "David Park",
  },
  {
    title: "Our secret weapon",
    quote:
      "The autonomous AI workflows give us a competitive edge. Tasks that took hours are now executed automatically in minutes.",
    imageSrc: "https://assets.aceternity.com/avatars/4.webp",
    name: "Lisa Thompson",
  },
  {
    title: "Incredible developer experience",
    quote:
      "Deploy, orchestrate, automate. The platform makes building intelligent AI agents straightforward and powerful.",
    imageSrc: "https://assets.aceternity.com/avatars/5.webp",
    name: "James Wilson",
  },
];

export function Testimonials() {
  return (
    <section className="bg-[#F5F7FC] py-16 md:py-24">
      <div className="mx-auto max-w-7xl px-4 md:px-8">
        <div className="text-center">
          <Heading as="h2">
            Loved by thousands <br /> of happy customers
          </Heading>
          <SubHeading
            as="p"
            className="mx-auto mt-4 max-w-md text-base text-gray-600 md:text-lg"
          >
            Hear from our community of builders, designers, and creators who
            trust us to power their projects.
          </SubHeading>
          <HoverBorderGradient
            containerClassName="mt-8 h-11"
            className="flex h-full items-center gap-2 px-6 py-2.5 font-medium"
          >
            <Link href="#" className="flex items-center gap-2">
              Read all reviews
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
                className="ml-1 size-4"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3"
                />
              </svg>
            </Link>
          </HoverBorderGradient>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {TESTIMONIALS.map((t, index) => (
            <TestimonialCard key={index} testimonial={t} index={index} />
          ))}
        </div>
      </div>
    </section>
  );
}

function TestimonialCard({
  testimonial,
  index,
}: {
  testimonial: (typeof TESTIMONIALS)[0];
  index: number;
}) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-50px" });

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 20 }}
      animate={isInView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.4, delay: index * 0.1 }}
      className="rounded-xl border border-[#21C4DD]/20 bg-white p-5 shadow-sm transition-colors hover:border-[#21C4DD]/30"
    >
      <p className="text-base font-semibold leading-snug text-[#150A35]">
        &ldquo;{testimonial.title}&rdquo;
      </p>
      <p className="mt-3 text-sm leading-relaxed text-gray-600">
        {testimonial.quote}
      </p>
      <div className="mt-4 flex items-center gap-3">
        <Image
          width={32}
          height={32}
          src={testimonial.imageSrc}
          alt={testimonial.name}
          className="size-8 rounded-full object-cover"
          loading="lazy"
        />
        <span className="text-sm font-medium text-[#150A35]">
          {testimonial.name}
        </span>
      </div>
    </motion.div>
  );
}
