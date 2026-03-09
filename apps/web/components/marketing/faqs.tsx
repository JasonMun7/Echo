"use client";

import React, { useRef, useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Heading } from "./heading";
import { SubHeading } from "./subheading";
import { cn } from "@/lib/utils";
import { IconPlus } from "@tabler/icons-react";
import { GridLineHorizontal, GridLineVertical } from "./grid-lines";

interface FAQItem {
  question: string;
  answer: string;
}

interface FAQSection {
  title: string;
  items: FAQItem[];
}

const faqData: FAQSection[] = [
  {
    title: "Pricing",
    items: [
      {
        question: "How much does it cost to deploy AI agents?",
        answer:
          "Our pricing starts at $19/month for the Starter plan. Scale plans start at $79/month for teams. Enterprise pricing is available for high-volume needs.",
      },
      {
        question: "Is there a free trial available?",
        answer:
          "Yes, we offer a 14-day free trial with full access to all features. No credit card required to get started.",
      },
      {
        question: "What happens if I exceed my plan limits?",
        answer:
          "We'll notify you when you reach 80% of your limits. You can upgrade at any time to continue uninterrupted.",
      },
    ],
  },
  {
    title: "Agents",
    items: [
      {
        question: "What can AI agents automate?",
        answer:
          "Our AI agents can automate complex workflows including data processing, customer support, content generation, scheduling, and multi-step decision making.",
      },
      {
        question: "How do I deploy and orchestrate my agents?",
        answer:
          "Use our visual workflow builder or SDK to define agent behaviors, then deploy with a single click. Our orchestration handles scaling and inter-agent communication automatically.",
      },
    ],
  },
  {
    title: "Legal",
    items: [
      {
        question: "How is my data protected?",
        answer:
          "We use enterprise-grade encryption. Your data is stored in SOC 2 Type II certified data centers. We never use your data to train models.",
      },
      {
        question: "Are you GDPR compliant?",
        answer:
          "Yes, we are fully GDPR compliant. We provide DPAs, support data portability, and offer data deletion capabilities.",
      },
    ],
  },
];

export function FAQs() {
  const [activeId, setActiveId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setActiveId(null);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const toggleQuestion = (id: string) => {
    setActiveId(activeId === id ? null : id);
  };

  return (
    <div className="mx-auto max-w-4xl overflow-hidden px-4 py-20 md:px-8 md:py-32">
      <div className="text-center">
        <Heading as="h2">Frequently Asked Questions</Heading>
        <SubHeading as="p" className="mx-auto mt-4 max-w-2xl">
          Everything you need to know about deploying AI agents and automating
          your workflows.
        </SubHeading>
      </div>

      <div
        ref={containerRef}
        className="relative mt-16 flex flex-col gap-12 px-4 md:px-8"
      >
        {faqData.map((section) => (
          <div key={section.title}>
            <h3 className="mb-6 text-lg font-medium text-[#150A35]">
              {section.title}
            </h3>
            <div className="flex flex-col gap-3">
              {section.items.map((item, index) => {
                const id = `${section.title}-${index}`;
                const isActive = activeId === id;
                return (
                  <div
                    key={id}
                    className={cn(
                      "relative rounded-lg transition-all duration-200",
                      isActive
                        ? "bg-white shadow-sm ring-1 ring-[#21C4DD]/25"
                        : "hover:bg-white/80"
                    )}
                  >
                    {isActive && (
                      <div className="absolute inset-0">
                        <GridLineHorizontal
                          className="-top-[2px]"
                          offset="100px"
                        />
                        <GridLineHorizontal
                          className="-bottom-[2px]"
                          offset="100px"
                        />
                        <GridLineVertical
                          className="-left-[2px]"
                          offset="100px"
                        />
                        <GridLineVertical
                          className="-right-[2px] left-auto"
                          offset="100px"
                        />
                      </div>
                    )}
                    <button
                      onClick={() => toggleQuestion(id)}
                      className="flex w-full items-center justify-between px-4 py-4 text-left"
                    >
                      <span className="text-sm font-medium text-[#150A35] md:text-base">
                        {item.question}
                      </span>
                      <motion.div
                        animate={{ rotate: isActive ? 45 : 0 }}
                        transition={{ duration: 0.2 }}
                        className="ml-4 shrink-0"
                      >
                        <IconPlus className={cn("size-5 shrink-0", isActive ? "text-[#21C4DD]" : "text-gray-500")} />
                      </motion.div>
                    </button>
                    <AnimatePresence initial={false}>
                      {isActive && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{
                            duration: 0.15,
                            ease: "easeInOut",
                          }}
                          className="relative"
                        >
                          <p className="max-w-[90%] px-4 pb-4 text-sm text-gray-600">
                            {item.answer}
                          </p>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
