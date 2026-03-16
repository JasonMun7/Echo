"use client";

import React, { useRef } from "react";
import { motion, useInView } from "motion/react";
import { Heading } from "./heading";
import { SubHeading } from "./subheading";

const USE_CASES = [
  {
    emoji: "♿",
    title: "Accessibility",
    headline: "\"EchoPrism, file my expenses.\"",
    story:
      "Sarah has early-stage Parkinson's. The mouse is hard. Now she says three words and watches her computer do the rest — no clicking, no keyboard, no frustration.",
    tag: "Motor impairment",
  },
  {
    emoji: "👴",
    title: "Non-technical users",
    headline: "\"Dad stopped calling me for IT help.\"",
    story:
      "Marcus recorded his dad's most common computer tasks once. Now his dad runs them with a voice command. Shared in 30 seconds. Zero setup required.",
    tag: "Family & caregiving",
  },
  {
    emoji: "⚡",
    title: "Power users",
    headline: "\"12 reports. Zero minutes.\"",
    story:
      "Emily runs a Monday digest across 12 clients. Echo does all 12 while she's in standup. It interrupted itself once to ask a question — and handled her answer mid-run.",
    tag: "Productivity",
  },
];

export function Testimonials() {
  return (
    <section className="bg-[#F5F7FC] py-16 md:py-24">
      <div className="mx-auto max-w-7xl px-4 md:px-8">
        <div className="text-center">
          <Heading as="h2">
            Who Echo is for
          </Heading>
          <SubHeading
            as="p"
            className="mx-auto mt-4 max-w-md text-base text-gray-600 md:text-lg"
          >
            Echo isn&apos;t just for developers. It&apos;s for anyone who
            has ever had to explain something that would be faster to just
            show.
          </SubHeading>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {USE_CASES.map((item, index) => (
            <UseCaseCard key={index} item={item} index={index} />
          ))}
        </div>
      </div>
    </section>
  );
}

function UseCaseCard({
  item,
  index,
}: {
  item: (typeof USE_CASES)[0];
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
      className="rounded-xl border border-[#A577FF]/20 bg-white p-5 shadow-sm transition-colors hover:border-[#A577FF]/30"
    >
      <div className="flex items-center gap-2 mb-3">
        <span className="text-2xl">{item.emoji}</span>
        <span className="rounded-full bg-[#A577FF]/10 px-2.5 py-0.5 text-xs font-medium text-[#A577FF]">
          {item.tag}
        </span>
      </div>
      <p className="text-base font-semibold leading-snug text-[#150A35]">
        {item.headline}
      </p>
      <p className="mt-3 text-sm leading-relaxed text-gray-600">
        {item.story}
      </p>
    </motion.div>
  );
}
